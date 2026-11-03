using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace WorkflowCompanion;

internal static class BuddyRenderer
{
    public const int BaseWidth=186;
    public const int BaseHeight=192;
    private static readonly Font TimeFont=new("Segoe UI",19,FontStyle.Bold,GraphicsUnit.Pixel);
    private static readonly Font LabelFont=new("Segoe UI",10,FontStyle.Bold,GraphicsUnit.Pixel);
    private static readonly Font HintFont=new("Segoe UI",9,FontStyle.Regular,GraphicsUnit.Pixel);
    private static readonly Font ZFont=new("Segoe UI",14,FontStyle.Bold,GraphicsUnit.Pixel);

    public static GraphicsPath RoundRect(RectangleF r,float radius)
    {
        float d=Math.Min(radius*2,Math.Min(r.Width,r.Height));
        var path=new GraphicsPath();
        path.AddArc(r.X,r.Y,d,d,180,90);
        path.AddArc(r.Right-d,r.Y,d,d,270,90);
        path.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
        path.AddArc(r.X,r.Bottom-d,d,d,90,90);
        path.CloseFigure();
        return path;
    }

    private static Color Mix(Color a,Color b,float t)
    {
        t=Math.Clamp(t,0,1);
        return Color.FromArgb((int)(a.R*(1-t)+b.R*t),(int)(a.G*(1-t)+b.G*t),(int)(a.B*(1-t)+b.B*t));
    }

    private static void FillRound(Graphics g,Brush brush,float x,float y,float w,float h,float r)
    {
        using var p=RoundRect(new RectangleF(x,y,w,h),r);
        g.FillPath(brush,p);
    }

    private static void Dot(Graphics g,Color color,float x,float y,float diameter)
    {
        using var b=new SolidBrush(color);
        g.FillEllipse(b,x,y,diameter,diameter);
    }

    public static void Render(Graphics g,CompanionSnapshot? snapshot,long lastSeenMs,double t)
    {
        g.SmoothingMode=SmoothingMode.AntiAlias;
        g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.CompositingQuality=CompositingQuality.HighQuality;
        var active=snapshot?.Active;
        bool idle=active is null;
        Color mood=idle?Color.FromArgb(107,127,149):
                   ColorTranslator.FromHtml(active!.Color);
        var bg=Color.FromArgb(24,29,39);
        var now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bool stale=now-lastSeenMs>90000&&lastSeenMs>0;
        double elapsedMs=idle?0:Math.Max(0,now-active!.StartMs);
        TimeSpan elapsed=TimeSpan.FromMilliseconds(elapsedMs);
        string time=idle?"00:00:00":
            $"{(long)elapsed.TotalHours:00}:{elapsed.Minutes:00}:{elapsed.Seconds:00}";
        // The whole rounded card is painted here, so previews and the actual window match.
        using(var shadow=new SolidBrush(Color.FromArgb(70,0,0,0)))
            FillRound(g,shadow,7,10,172,174,28);
        using(var dark=new SolidBrush(bg))
            FillRound(g,dark,7,7,172,174,27);
        using(var edge=new Pen(Color.FromArgb(45,208,221,242),1.2f))
        using(var shape=RoundRect(new RectangleF(8,8,170,172),26))
            g.DrawPath(edge,shape);

        // Breathing bounce, independently of wall-clock timer accuracy.
        float bounce=(float)Math.Sin(t*(idle?1.3:2.1))*(idle?1.7f:2.5f);
        float faceX=47,faceY=21+bounce;
        if(!idle && active!.Category=="adhd")faceX+=(float)Math.Sin(t*3.8)*1.7f;

        // Cozy halo, in the user's category color.
        using(var halo=new SolidBrush(Color.FromArgb(28,mood)))
            g.FillEllipse(halo,35,14,116,108);
        using(var body=RoundRect(new RectangleF(faceX,faceY,92,87),30))
        using(var gradient=new LinearGradientBrush(
            new RectangleF(faceX,faceY,92,87),Mix(mood,Color.White,.30f),
            Mix(mood,Color.Black,.19f),LinearGradientMode.ForwardDiagonal))
        {
            g.FillPath(gradient,body);
            using var pen=new Pen(Color.FromArgb(76,255,255,255),1.5f);
            g.DrawPath(pen,body);
        }
        // Tiny ears on curious (ADHD) days.
        if(!idle && active!.Category=="adhd")
        {
            using var ear=new SolidBrush(mood);
            g.FillEllipse(ear,faceX-5,faceY+24,12,17);
            g.FillEllipse(ear,faceX+85,faceY+24,12,17);
        }

        using(var shine=new SolidBrush(Color.FromArgb(65,255,255,255)))
            g.FillEllipse(shine,faceX+17,faceY+7,35,10);
        bool blink=(t+0.9)%5.2<.16 || (idle && (t+0.9)%3.6<.2);
        bool wink=!idle&&active!.Category=="adhd"&&(t+.25)%8.1<.20;
        float drift=idle?0:active!.Category=="adhd"?(float)Math.Sin(t*1.9)*3f:active.Category=="personal"?(float)Math.Sin(t*.5):0;
        float pupilY=faceY+43;
        float leftX=faceX+29+drift,rightX=faceX+63+drift;
        using(var eyeWhite=new SolidBrush(Color.FromArgb(245,250,253)))
        using(var pupil=new SolidBrush(Color.FromArgb(30,39,54)))
        using(var lid=new Pen(Color.FromArgb(45,52,69),3.4f){StartCap=LineCap.Round,EndCap=LineCap.Round})
        {
            if(blink||idle)
            {
                g.DrawArc(lid,leftX-9,pupilY-4,19,10,0,180);
                g.DrawArc(lid,rightX-9,pupilY-4,19,10,0,180);
            }
            else
            {
                float h=active!.Category=="professional"?20:23;
                g.FillEllipse(eyeWhite,leftX-11,pupilY-11,22,h);
                if(!wink)g.FillEllipse(eyeWhite,rightX-11,pupilY-11,22,h);
                else g.DrawLine(lid,rightX-9,pupilY,rightX+9,pupilY);
                g.FillEllipse(pupil,leftX-4,pupilY-4,8,11);
                if(!wink)g.FillEllipse(pupil,rightX-4,pupilY-4,8,11);
                Dot(g,Color.White,leftX-1,pupilY-2,3);
                if(!wink)Dot(g,Color.White,rightX-1,pupilY-2,3);
            }
        }
        // Calm, focus, and curiosity use deliberately different mouths.
        using(var mouth=new Pen(Color.FromArgb(45,52,69),2.7f){StartCap=LineCap.Round,EndCap=LineCap.Round})
        {
            if(idle)g.DrawArc(mouth,faceX+40,faceY+64,12,7,0,180);
            else if(active!.Category=="professional")g.DrawLine(mouth,faceX+41,faceY+69,faceX+53,faceY+69);
            else if(active.Category=="personal")g.DrawArc(mouth,faceX+35,faceY+61,23,14,5,170);
            else g.DrawArc(mouth,faceX+37,faceY+59,20,17,5,170);
        }

        if(idle)
        {
            float zShift=(float)((t*12)%20);
            using var zBrush=new SolidBrush(Color.FromArgb(90,190,207,227));
            g.DrawString("z",ZFont,zBrush,141,43-zShift);
            g.DrawString("z",HintFont,zBrush,155,64-zShift*.6f);
        }
        else if(active!.Category=="adhd")
        {
            float sparkle=(float)(.5+.5*Math.Sin(t*3));
            using var star=new Pen(Color.FromArgb((int)(110+110*sparkle),mood),1.7f);
            g.DrawLine(star,145,38,145,49);
            g.DrawLine(star,139,43.5f,151,43.5f);
            Dot(g,Color.FromArgb(160,mood),29,72,3);
        }
        else if(active!.Category=="personal")
        {
            Dot(g,Color.FromArgb(85,255,255,255),51,faceY+60,6);
            Dot(g,Color.FromArgb(85,255,255,255),129,faceY+60,6);
        }
        else
        {
            // Focus indicator glints at a slower rate than blinks.
            Dot(g,Color.FromArgb(150,mood),150,70+(float)Math.Sin(t)*4,4);
        }

        using(var rule=new Pen(Color.FromArgb(38,210,222,239)))
            g.DrawLine(rule,29,122,158,122);
        using var aligned=new StringFormat{Alignment=StringAlignment.Center,LineAlignment=StringAlignment.Center,
            Trimming=StringTrimming.EllipsisCharacter,FormatFlags=StringFormatFlags.NoWrap};
        using var white=new SolidBrush(Color.FromArgb(245,250,253));
        using var faint=new SolidBrush(Color.FromArgb(155,171,189));
        g.DrawString(time,TimeFont,white,new RectangleF(15,126,156,32),aligned);
        string category=idle?"READY WHEN YOU ARE":active!.Name.ToUpperInvariant();
        g.DrawString(category,LabelFont,faint,new RectangleF(17,159,152,15),aligned);

        // Small connection indicator: this never changes the tracking state.
        Dot(g,stale?Color.FromArgb(252,181,113):idle?Color.FromArgb(118,139,157):Color.FromArgb(102,223,171),155,16,6);
        if(stale)
        {
            using var tooltip=new SolidBrush(Color.FromArgb(172,189,206));
            g.DrawString("offline",HintFont,tooltip,new PointF(15,16));
        }
    }

    public static void SaveSamples(string directory)
    {
        Directory.CreateDirectory(directory);
        long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var subjects=new (string Name,CompanionSnapshot Snapshot)[]
        {
            ("idle",new(null)),
            ("professional",new(new(now-62*60000,"professional","Engineering","#EF793E"))),
            ("personal",new(new(now-24*60000,"personal","Personal","#60C4B0"))),
            ("adhd",new(new(now-9*60000,"adhd","ADHD / Other","#B5A1D8")))
        };
        using var sheet=new Bitmap(4*BaseWidth,BaseHeight+26);
        using(var gs=Graphics.FromImage(sheet))
        {
            gs.Clear(Color.FromArgb(224,232,242));
            for(int i=0;i<subjects.Length;i++)
            {
                var item=subjects[i];
                using var single=new Bitmap(BaseWidth,BaseHeight);
                using(var g=Graphics.FromImage(single))
                {
                    g.Clear(Color.Transparent);
                    Render(g,item.Snapshot,now,1.25+i*.6);
                }
                single.Save(Path.Combine(directory,item.Name+".png"),ImageFormat.Png);
                gs.DrawImage(single,i*BaseWidth,0);
                using var font=new Font("Segoe UI",10,FontStyle.Bold);
                using var brush=new SolidBrush(Color.FromArgb(50,64,80));
                gs.DrawString(item.Name,font,brush,i*BaseWidth+44,BaseHeight+3);
            }
        }
        sheet.Save(Path.Combine(directory,"mood-gallery.png"),ImageFormat.Png);
    }
}
