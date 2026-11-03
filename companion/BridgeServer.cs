using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
namespace WorkflowCompanion;
internal sealed class BridgeServer:IDisposable
{
    public const int DefaultPort=38473;
    private readonly TcpListener _listener;
    private readonly CancellationTokenSource _stop=new();
    private readonly SemaphoreSlim _parallel=new(8);
    private readonly Action<CompanionSnapshot> _onUpdate;
    private string _key;
    public int Port=>((IPEndPoint)_listener.LocalEndpoint).Port;
    public BridgeServer(string key,Action<CompanionSnapshot> onUpdate,int port=DefaultPort)
    {
        _key=key;_onUpdate=onUpdate;
        // No LAN listeners, no administrative URLACL, no network or Internet dependencies.
        _listener=new TcpListener(IPAddress.Loopback,port);
    }
    public void Start()
    {
        _listener.Start(8);
        _=Task.Run(AcceptLoop);
    }
    public void SetKey(string key)=>Interlocked.Exchange(ref _key,key);
    private async Task AcceptLoop()
    {
        while(!_stop.IsCancellationRequested)
        {
            TcpClient client;
            try{client=await _listener.AcceptTcpClientAsync(_stop.Token);}
            catch(Exception e) when(e is SocketException or ObjectDisposedException or OperationCanceledException){break;}
            _=Task.Run(async()=>{
                try
                {
                    await _parallel.WaitAsync(_stop.Token);
                    try{await HandleClient(client);}finally{_parallel.Release();}
                }
                catch(Exception e) when(e is IOException or SocketException or OperationCanceledException or ObjectDisposedException){}
                finally{client.Dispose();}
            });
        }
    }
    private static bool ExtensionOrigin(string? origin)
    {
        if(string.IsNullOrEmpty(origin))return true; // Worker requests may omit the Origin header.
        return origin.Length==51 && origin.StartsWith("chrome-extension://",StringComparison.Ordinal) &&
            origin.AsSpan(19).ToString().All(c=>c>='a' && c<='p');
    }
    private bool Authorized(string? key)
    {
        if(key is null || key.Length!=32)return false;
        byte[] expected=Encoding.ASCII.GetBytes(Volatile.Read(ref _key).ToUpperInvariant());
        byte[] supplied=Encoding.ASCII.GetBytes(key.ToUpperInvariant());
        return CryptographicOperations.FixedTimeEquals(expected,supplied);
    }
    private async Task HandleClient(TcpClient client)
    {
        using var cts=CancellationTokenSource.CreateLinkedTokenSource(_stop.Token);
        cts.CancelAfter(TimeSpan.FromSeconds(3));
        var stream=client.GetStream();
        byte[] buffer=new byte[4096];
        using var collected=new MemoryStream();
        int end=-1;
        while(end<0 && collected.Length<8192)
        {
            int n=await stream.ReadAsync(buffer,cts.Token);
            if(n==0)return;
            collected.Write(buffer,0,n);
            end=HeaderEnd(collected.GetBuffer(),(int)collected.Length);
        }
        if(end<0){await Respond(stream,431,null,cts.Token);return;}
        byte[] raw=collected.ToArray();
        string[] lines=Encoding.ASCII.GetString(raw,0,end).Split("\r\n",StringSplitOptions.None);
        string[] first=lines[0].Split(' ');
        if(first.Length!=3 || first[1]!="/v1/state"){await Respond(stream,404,null,cts.Token);return;}
        var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        foreach(string line in lines.Skip(1))
        {
            int colon=line.IndexOf(':');
            if(colon>0)headers[line[..colon].Trim()]=line[(colon+1)..].Trim();
        }
        headers.TryGetValue("Origin",out string? origin);
        if(!ExtensionOrigin(origin)){await Respond(stream,403,null,cts.Token);return;}
        if(first[0]=="OPTIONS")
        {
            if(string.IsNullOrEmpty(origin)){await Respond(stream,403,null,cts.Token);return;}
            await Respond(stream,204,origin,cts.Token);return;
        }
        if(first[0]!="POST"){await Respond(stream,405,origin,cts.Token);return;}
        headers.TryGetValue("X-Workflow-Key",out string? key);
        if(!Authorized(key)){await Respond(stream,401,origin,cts.Token);return;}
        if(!headers.TryGetValue("Content-Length",out string? lengthText)||
           !int.TryParse(lengthText,out int length)||length<10||length>2048)
        {await Respond(stream,413,origin,cts.Token);return;}
        byte[] data=new byte[length];
        int extra=Math.Min(raw.Length-end-4,length);
        if(extra>0)Array.Copy(raw,end+4,data,0,extra);
        if(extra<length)await stream.ReadExactlyAsync(data.AsMemory(extra,length-extra),cts.Token);
        if(!CompanionProtocol.TryParse(Encoding.UTF8.GetString(data),out var snapshot))
        {await Respond(stream,400,origin,cts.Token);return;}
        _onUpdate(snapshot);
        await Respond(stream,204,origin,cts.Token);
    }
    private static int HeaderEnd(byte[] data,int length)
    {
        for(int i=3;i<length;i++)
            if(data[i-3]==13 && data[i-2]==10 && data[i-1]==13 && data[i]==10)return i-3;
        return -1;
    }
    private static async Task Respond(NetworkStream stream,int status,string? origin,CancellationToken token)
    {
        string title=status switch{
            204=>"No Content",400=>"Bad Request",401=>"Unauthorized",403=>"Forbidden",
            404=>"Not Found",405=>"Method Not Allowed",413=>"Payload Too Large",
            _=>"Request Header Fields Too Large"
        };
        string cors=origin is null?"":"Access-Control-Allow-Origin: "+origin+"\r\nVary: Origin\r\n"+
            "Access-Control-Allow-Methods: OPTIONS, POST\r\n"+
            "Access-Control-Allow-Headers: Content-Type, X-Workflow-Key\r\n";
        string reply="HTTP/1.1 "+status+" "+title+"\r\nContent-Length: 0\r\n"+
            "Connection: close\r\nCache-Control: no-store\r\n"+cors+"\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(reply),token);
    }
    public void Dispose(){_stop.Cancel();_listener.Stop(); /* Dispose after in-flight requests exit */ }
}
