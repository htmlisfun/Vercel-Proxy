const http = require('http');
const https = require('https');
const url = require('url');

// Define the port. We keep this for local testing, but Vercel ignores it 
// when the file is used as a serverless function.
const PROXY_PORT = process.env.PORT || 8080;

/**
 * Handles incoming requests to the proxy server.
 * @param {http.IncomingMessage} req - The incoming request from the client.
 * @param {http.ServerResponse} res - The response object to send back to the client.
 */
function requestHandler(req, res) {
    // 1. Get the target URL from the request path.
    // The client should send the target URL in the proxy path, e.g., /https://example.com
    // We slice(1) to remove the leading '/'
    const targetUrl = req.url.slice(1); 

    // If no target URL is provided, show a help message.
    if (!targetUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <body style="font-family: sans-serif; background-color: #0d1117; color: white; padding: 20px;">
                    <h2>Simple Node.js Web Proxy</h2>
                    <p>To use, prepend the full URL you want to access to the proxy's address:</p>
                    <p style="background-color: #21262d; padding: 10px; border-radius: 6px;">
                        <strong>Example (replace this address with your deployed domain):</strong> [YOUR_VERCEL_DOMAIN]/https://www.google.com
                    </p>
                    <p>This proxy forwards GET requests and returns the content.</p>
                </body>
            </html>
        `);
        return;
    }

    // 2. Parse the target URL
    const parsedUrl = url.parse(targetUrl);

    // Basic safety check: Ensure the protocol is HTTP or HTTPS
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
         res.writeHead(400, { 'Content-Type': 'text/plain' });
         res.end('Error: Only http or https protocols are supported.');
         return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const protocolModule = isHttps ? https : http;

    // 3. Define options for the request to the destination server
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: req.method,
        headers: { ...req.headers } // Copy client headers
    };

    // Remove proxy-specific headers that might confuse the destination server
    delete options.headers.host; 

    console.log(`[Proxy] Forwarding ${req.method} request to: ${targetUrl}`);

    // 4. Make the request to the destination server
    const proxyReq = protocolModule.request(options, proxyRes => {
        // Set the status code and headers from the destination server response
        res.writeHead(proxyRes.statusCode, proxyRes.headers);

        // Pipe the response data back to the client
        proxyRes.pipe(res, { end: true });
    });

    // Handle errors during the destination request (e.g., DNS lookup failure)
    proxyReq.on('error', (e) => {
        console.error(`[Proxy Error] Problem with request to target: ${e.message}`);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Proxy Error: Could not reach target server. (${e.message})`);
        }
    });

    // If the client request has a body (e.g., POST), pipe it to the destination request
    req.pipe(proxyReq, { end: true });
}

// Check if running locally or deployed
if (process.env.VERCEL_ENV) {
    // If deployed on Vercel, export the handler function
    module.exports = requestHandler;
} else {
    // If running locally, create and start the traditional server
    const server = http.createServer(requestHandler);

    server.listen(PROXY_PORT, (err) => {
        if (err) {
            console.error('Error starting server:', err);
        } else {
            console.log(`Proxy server running locally on http://localhost:${PROXY_PORT}`);
            console.log(`To run locally: node proxy_server.js`);
        }
    });
}
