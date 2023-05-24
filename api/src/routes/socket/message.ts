import { Server, Socket } from "socket.io"

const message = (io: Server, socket: Socket) => {
  socket.on('input-change', (message) => {
    socket.broadcast.emit('input-change', message)
  })
}

export default message