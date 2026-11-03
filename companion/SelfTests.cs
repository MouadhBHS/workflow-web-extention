using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
namespace WorkflowCompanion;
internal static class SelfTests
{
    private static void Check(bool yes,string message){if(!yes)throw new Exception(message);}
    private static string ActiveJson(long now,string category="professional",string color="#EF793E")=>
        "{\"version\":1,\"active\":{\"start_ms\":"+now+",\"category\":\""+category+
        "\",\"name\":\"Engineering\",\"color\":\""+color+"\"}}";
    public static async Task<int> Run()
    {
        try
        {
            long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            Check(CompanionProtocol.TryParse("{\"version\":1,\"active\":null}",out var idle)&&idle.Active is null,"idle");
            Check(CompanionProtocol.TryParse(ActiveJson(now-60000),out var s)&&s.Active?.Category=="professional","active");
            Check(!CompanionProtocol.TryParse(ActiveJson(now,"invalid"),out _),"invalid category");
            Check(!CompanionProtocol.TryParse(ActiveJson(now,"professional","red"),out _),"invalid hex color");
            Check(!CompanionProtocol.TryParse(ActiveJson(now+90000),out _),"future start");
            Check(!CompanionProtocol.TryParse("{\"version\":1,\"active\":{}",out _),"broken JSON");
            string key=CompanionSettings.GenerateKey();
            Check(key.Length==32,"secret entropy format");
            CompanionSnapshot? received=null;
            using var server=new BridgeServer(key,x=>received=x,0);
            server.Start();
            using var http=new HttpClient{Timeout=TimeSpan.FromSeconds(4)};
            string url="http://127.0.0.1:"+server.Port+"/v1/state";

            async Task<HttpStatusCode> Send(string json,string access,string origin="chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
            {
                using var req=new HttpRequestMessage(HttpMethod.Post,url);
                req.Headers.TryAddWithoutValidation("Origin",origin);
                req.Headers.TryAddWithoutValidation("X-Workflow-Key",access);
                req.Content=new StringContent(json,Encoding.UTF8,"application/json");
                using var response=await http.SendAsync(req);
                return response.StatusCode;
            }
            Check(await Send(ActiveJson(now-120000),"0"+key[1..])==HttpStatusCode.Unauthorized,"wrong key");
            Check(received is null,"unauthorized message mutated state");
            Check(await Send(ActiveJson(now-120000),key,"https://evil.example")==HttpStatusCode.Forbidden,"website origin");
            Check(await Send(ActiveJson(now-120000,"bad"),key)==HttpStatusCode.BadRequest,"invalid schema");
            Check(await Send(ActiveJson(now-120000),key)==HttpStatusCode.NoContent,"authenticated POST");
            Check(received?.Active?.Category=="professional","desktop state synced");
            using var pre=new HttpRequestMessage(HttpMethod.Options,url);
            pre.Headers.TryAddWithoutValidation("Origin","chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
            using var response=await http.SendAsync(pre);
            Check(response.StatusCode==HttpStatusCode.NoContent,"CORS preflight");
            Check(await Send("{\"version\":1,\"active\":null,\"disconnect\":true}",key)==HttpStatusCode.NoContent,"disconnect");
            Check(received?.Disconnected==true && received.Active is null,"disconnect clears widget");
            var changed=CompanionSettings.GenerateKey();
            server.SetKey(changed);
            Check(await Send(ActiveJson(now),key)==HttpStatusCode.Unauthorized,"regenerated key invalidates old one");
            Check(await Send(ActiveJson(now),changed)==HttpStatusCode.NoContent,"regenerated key works");
            Console.WriteLine("PASS: schema, secret, origin, HTTP bridge, disconnect, rotation");
            return 0;
        }
        catch(Exception e){Console.Error.WriteLine("SELF TEST FAILED: "+e);return 1;}
    }
}
