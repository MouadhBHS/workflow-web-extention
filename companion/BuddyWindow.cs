using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Windows.Forms;
namespace WorkflowCompanion;

internal sealed class BuddyWindow:Form
{
    private readonly CompanionSettings _settings;
    private readonly System.Windows.Forms.Timer _animation=new(){Interval=80};
    private readonly NotifyIcon _tray;
    private readonly Icon _icon;
    private readonly ContextMenuStrip _menu=new();
    private BridgeServer? _server;
    private readonly DateTime _started=DateTime.UtcNow;
    private CompanionSnapshot? _snapshot;
    private long _lastSeen;
    private Point? _drag;
    private string? _bridgeError;

    public BuddyWindow(CompanionSettings settings)
    {
        _settings=settings;
        _snapshot=settings.Snapshot;
        _lastSeen=settings.LastReceivedMs;
        Text="Workflow Buddy";
        FormBorderStyle=FormBorderStyle.None;
        ShowInTaskbar=false;
        MinimizeBox=false;
        MaximizeBox=false;
        TopMost=true;
        StartPosition=FormStartPosition.Manual;
        BackColor=Color.Magenta;
        TransparencyKey=Color.Magenta;
        DoubleBuffered=true;
        SetStyle(ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|
                 ControlStyles.UserPaint|ControlStyles.ResizeRedraw,true);

        _icon=MakeIcon();
        _tray=new NotifyIcon{Icon=_icon,Text="Workflow Buddy — floating timer",Visible=true};
        _tray.DoubleClick+=(_,_)=>ShowWidget();
        ConfigureMenu();
        _tray.ContextMenuStrip=_menu;
        ContextMenuStrip=_menu;
        ResizeWidget();
        RestoreLocation();

        _animation.Tick+=(_,_)=>Invalidate();
        _animation.Start();
        Shown+=(_,_)=>StartBridge();
    }

    private static Icon MakeIcon()
    {
        using var bmp=new Bitmap(64,64);
        using(var g=Graphics.FromImage(bmp))
        {
            g.SmoothingMode=SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var b=new SolidBrush(Color.FromArgb(239,121,62));
            g.FillEllipse(b,3,3,58,58);
            using var eye=new SolidBrush(Color.White);
            g.FillEllipse(eye,16,22,13,17);
            g.FillEllipse(eye,35,22,13,17);
            using var dot=new SolidBrush(Color.FromArgb(29,35,46));
            g.FillEllipse(dot,20,26,6,9);
            g.FillEllipse(dot,39,26,6,9);
            using var smile=new Pen(Color.FromArgb(29,35,46),3.4f);
            g.DrawArc(smile,23,37,20,10,5,170);
        }
        IntPtr h=bmp.GetHicon();
        try {using var original=Icon.FromHandle(h);return (Icon)original.Clone();}
        finally {DestroyIcon(h);}
    }

    [DllImport("user32.dll",SetLastError=true)]
    private static extern bool DestroyIcon(IntPtr handle);

    private void ConfigureMenu()
    {
        var show=new ToolStripMenuItem("Show floating timer");
        show.Click+=(_,_)=>ShowWidget();
        _menu.Items.Add(show);
        var copy=new ToolStripMenuItem("Copy pairing key");
        copy.Click+=(_,_)=>CopyKey();
        _menu.Items.Add(copy);
        var newKey=new ToolStripMenuItem("Regenerate pairing key");
        newKey.Click+=(_,_)=>RegenerateKey();
        _menu.Items.Add(newKey);
        _menu.Items.Add(new ToolStripSeparator());

        var start=new ToolStripMenuItem("Start with Windows"){Checked=CompanionSettings.IsStartupEnabled(),CheckOnClick=true};
        start.Click+=(_,_)=>{
            try{CompanionSettings.SetStartupEnabled(start.Checked);}
            catch(Exception error){start.Checked=!start.Checked;MessageBox.Show(error.Message,"Startup setting");}
        };
        _menu.Items.Add(start);
        var sizeMenu=new ToolStripMenuItem("Widget size");
        foreach(var (label,value) in new[]{("Small (80%)",.8f),("Medium (100%)",1f),("Large (125%)",1.25f)})
        {
            float target=value;
            var item=new ToolStripMenuItem(label){Checked=Math.Abs(_settings.Scale-target)<.01f};
            item.Click+=(_,_)=>{_settings.Scale=target;ResizeWidget();_settings.Save();foreach(ToolStripItem sibling in sizeMenu.DropDownItems)if(sibling is ToolStripMenuItem m)m.Checked=m==item;};
            sizeMenu.DropDownItems.Add(item);
        }
        _menu.Items.Add(sizeMenu);
        var hide=new ToolStripMenuItem("Hide (keep in tray)");
        hide.Click+=(_,_)=>Hide();
        _menu.Items.Add(hide);
        _menu.Items.Add(new ToolStripSeparator());
        var exit=new ToolStripMenuItem("Exit Workflow Buddy");
        exit.Click+=(_,_)=>Close();
        _menu.Items.Add(exit);
    }

    private void CopyKey()
    {
        try
        {
            Clipboard.SetText(_settings.Key);
            _tray.BalloonTipTitle="Pairing key copied";
            _tray.BalloonTipText="Paste it into the Workflow extension: Settings → Floating desktop companion.";
            _tray.ShowBalloonTip(2500);
        }
        catch(Exception error){MessageBox.Show(error.Message,"Clipboard unavailable");}
    }

    private void RegenerateKey()
    {
        if(MessageBox.Show("This disconnects your existing browser pairing. Continue?",
                "Regenerate pairing key",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        _settings.Key=CompanionSettings.GenerateKey();
        _settings.Snapshot=new CompanionSnapshot(null,true);
        _snapshot=_settings.Snapshot;
        _lastSeen=0;
        _settings.Save();
        _server?.SetKey(_settings.Key);
        Invalidate();
        CopyKey();
    }

    private void ShowWidget()
    {
        Show();
        WindowState=FormWindowState.Normal;
        TopMost=true;
        Activate();
        BringToFront();
    }

    private void ResizeWidget()
    {
        Size=new Size((int)(BuddyRenderer.BaseWidth*_settings.Scale),
                      (int)(BuddyRenderer.BaseHeight*_settings.Scale));
        using var regionPath=BuddyRenderer.RoundRect(new RectangleF(
            7*_settings.Scale,7*_settings.Scale,172*_settings.Scale,174*_settings.Scale),
            27*_settings.Scale);
        Region?.Dispose();
        Region=new Region(regionPath);
    }

    private void RestoreLocation()
    {
        var primary=Screen.PrimaryScreen?.WorkingArea??new Rectangle(20,20,1280,720);
        Point saved=new(_settings.WindowX??primary.Right-Width-24,
                        _settings.WindowY??primary.Bottom-Height-24);
        bool visible=false;
        foreach(var screen in Screen.AllScreens)
        {
            var overlap=Rectangle.Intersect(screen.WorkingArea,new Rectangle(saved,Size));
            if(overlap.Width>=60&&overlap.Height>=60){visible=true;break;}
        }
        Location=visible?saved:new Point(primary.Right-Width-24,primary.Bottom-Height-24);
    }

    private void StartBridge()
    {
        try
        {
            _server=new BridgeServer(_settings.Key,snapshot=>{
                if(IsDisposed||!IsHandleCreated)return;
                try{BeginInvoke((Action)(()=>ApplySnapshot(snapshot)));}
                catch(InvalidOperationException){}
            });
            _server.Start();
        }
        catch(SocketException error)
        {
            _bridgeError="Port 38473 is in use";
            _tray.BalloonTipTitle="Workflow Buddy can't connect";
            _tray.BalloonTipText="Port 38473 is unavailable. Close another Workflow Buddy instance and reopen. "+error.SocketErrorCode;
            _tray.ShowBalloonTip(5000);
            Invalidate();
        }
    }

    private void ApplySnapshot(CompanionSnapshot snapshot)
    {
        _lastSeen=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if(snapshot!=_snapshot)
        {
            _snapshot=snapshot;
            _settings.Snapshot=snapshot;
            _settings.LastReceivedMs=_lastSeen;
            try{_settings.Save();}
            catch(System.IO.IOException) { /* Live display must keep working if settings are unwritable. */ }
        }
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.Clear(Color.Magenta);
        e.Graphics.ScaleTransform(_settings.Scale,_settings.Scale);
        double t=(DateTime.UtcNow-_started).TotalSeconds;
        BuddyRenderer.Render(e.Graphics,_snapshot,_lastSeen,t);
        if(_bridgeError is not null)
        {
            using var red=new SolidBrush(Color.FromArgb(250,119,105));
            using var font=new Font("Segoe UI",9,FontStyle.Bold);
            e.Graphics.DrawString("PORT BUSY",font,red,13,17);
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if(e.Button==MouseButtons.Left)_drag=new Point(Cursor.Position.X-Left,Cursor.Position.Y-Top);
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if(_drag is { } offset && e.Button.HasFlag(MouseButtons.Left))
            Location=new Point(Cursor.Position.X-offset.X,Cursor.Position.Y-offset.Y);
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if(_drag is not null)
        {
            _drag=null;
            _settings.WindowX=Left;
            _settings.WindowY=Top;
            try{_settings.Save();}catch(System.IO.IOException){}
        }
    }
    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _animation.Stop();
        _animation.Dispose();
        _server?.Dispose();
        _tray.Visible=false;
        _tray.Dispose();
        _icon.Dispose();
        _menu.Dispose();
        base.OnFormClosed(e);
    }
}
