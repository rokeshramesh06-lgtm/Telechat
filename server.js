const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { initSocket } = require('./src/lib/socket');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  initSocket(io);

  httpServer.listen(port, () => {
    console.log(`TeleChat running on http://localhost:${port}`);
  });
});
