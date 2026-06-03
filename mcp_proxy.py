import asyncio
import sys
from mcp.client.sse import sse_client
from mcp.server.stdio import stdio_server
from mcp import ClientSession

# Replace with your actual Firebase UID
UID = "8zMI4IVkwuOjFWL7zhqag4KTwM92"
URL = f"https://kaustubh5934-vaultmcp-backend.hf.space/mcp/sse?uid={UID}"

async def proxy():
    try:
        # Connect to the remote SSE Server
        async with sse_client(URL) as streams:
            # We don't actually need to initialize the session ourselves,
            # we just need to pass the raw JSON RPC messages back and forth 
            # between stdio (the IDE) and the SSE streams (the remote server).
            read_stream, write_stream = streams
            
            async with stdio_server() as (local_read, local_write):
                # Forward messages from remote SSE to local IDE
                async def forward_remote_to_local():
                    async for message in read_stream:
                        await local_write.send(message)
                
                # Forward messages from local IDE to remote SSE
                async def forward_local_to_remote():
                    async for message in local_read:
                        await write_stream.send(message)
                
                await asyncio.gather(
                    forward_remote_to_local(),
                    forward_local_to_remote()
                )
    except Exception as e:
        print(f"Proxy error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(proxy())
