using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
namespace WorkflowCompanion;
internal static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--self-test")
            return SelfTests.Run().GetAwaiter().GetResult();
        if (args.Length == 2 && args[0] == "--render-samples")
        {
            Directory.CreateDirectory(args[1]);
            BuddyRenderer.SaveSamples(args[1]);
            return 0;
        }
        ApplicationConfiguration.Initialize();
        using var mutex = new Mutex(true, @"Local\WorkflowCompanion-FloatingClock", out bool created);
        if (!created)
        {
            MessageBox.Show("Workflow Buddy is already running. Check the system tray.", "Workflow Buddy");
            return 0;
        }
        try
        {
            Application.Run(new BuddyWindow(CompanionSettings.Load()));
            return 0;
        }
        catch(Exception ex)
        {
            MessageBox.Show(ex.Message, "Workflow Buddy couldn't start", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
