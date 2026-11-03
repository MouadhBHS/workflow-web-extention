using System;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace WorkflowCompanion;
internal sealed record CompanionSession(long StartMs,string Category,string Name,string Color);
internal sealed record CompanionSnapshot(CompanionSession? Active,bool Disconnected=false);
internal static class CompanionProtocol
{
    public static bool TryParse(string json,out CompanionSnapshot snapshot)
    {
        snapshot=new(null);
        try
        {
            using var doc=JsonDocument.Parse(json,new JsonDocumentOptions{MaxDepth=8});
            var root=doc.RootElement;
            if(root.ValueKind!=JsonValueKind.Object || !root.TryGetProperty("version",out var ver) ||
               ver.GetInt32()!=1 || !root.TryGetProperty("active",out var active))return false;
            bool disconnected=root.TryGetProperty("disconnect",out var disc)&&disc.ValueKind==JsonValueKind.True;
            if(active.ValueKind==JsonValueKind.Null){snapshot=new(null,disconnected);return true;}
            if(active.ValueKind!=JsonValueKind.Object||disconnected)return false;
            long start=active.GetProperty("start_ms").GetInt64();
            string? cat=active.GetProperty("category").GetString();
            string? name=active.GetProperty("name").GetString();
            string? color=active.GetProperty("color").GetString();
            if(start<0 || start>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+60000 ||
               cat is not ("professional" or "personal" or "adhd") ||
               string.IsNullOrWhiteSpace(name)||name.Length>32 ||
               color is null || !Regex.IsMatch(color,"^#[a-fA-F0-9]{6}$"))return false;
            snapshot=new(new(start,cat,name.Trim(),color.ToUpperInvariant()));
            return true;
        }
        catch(Exception e) when(e is JsonException or InvalidOperationException or FormatException
                                or KeyNotFoundException or OverflowException){return false;}
    }
}
