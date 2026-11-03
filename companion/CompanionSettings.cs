using System;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;
namespace WorkflowCompanion;
internal sealed class CompanionSettings
{
    private static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WorkflowBuddy");
    private static readonly string FilePath = Path.Combine(Folder,"settings.json");
    public string Key { get; set; } = GenerateKey();
    public int? WindowX { get; set; }
    public int? WindowY { get; set; }
    public float Scale { get; set; } = 1.0f;
    public CompanionSnapshot? Snapshot { get; set; }
    public long LastReceivedMs { get; set; }
    public static string GenerateKey() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
    public static CompanionSettings Load()
    {
        CompanionSettings result;
        try {result = File.Exists(FilePath) ?
            JsonSerializer.Deserialize<CompanionSettings>(File.ReadAllText(FilePath))??new() :new();}
        catch(Exception e) when(e is IOException or JsonException or UnauthorizedAccessException) {result=new();}
        if(!Regex.IsMatch(result.Key??"", "^[a-fA-F0-9]{32}$"))result.Key=GenerateKey();
        if(result.Scale<0.7f||result.Scale>1.5f||float.IsNaN(result.Scale))result.Scale=1;
        if(result.Snapshot?.Active is { } a && (a.StartMs<0 ||
            a.StartMs>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+60000 ||
            a.Name.Length>32||a.Color.Length!=7))result.Snapshot=null;
        result.Save();
        return result;
    }
    public void Save()
    {
        Directory.CreateDirectory(Folder);
        string temp=FilePath+".tmp";
        File.WriteAllText(temp,JsonSerializer.Serialize(this,new JsonSerializerOptions{WriteIndented=true}));
        File.Move(temp,FilePath,true);
    }
    public static bool IsStartupEnabled()
    {
        using var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        return key?.GetValue("WorkflowBuddy") is string;
    }
    public static void SetStartupEnabled(bool value)
    {
        using var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run",true);
        if(value)key.SetValue("WorkflowBuddy","\""+Environment.ProcessPath+"\"");
        else key.DeleteValue("WorkflowBuddy",false);
    }
}
