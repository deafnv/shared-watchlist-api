import { Server, Socket } from "socket.io"

const roll = (io: Server, socket: Socket) => {
  socket.on('roll', (payload) => {
    socket.broadcast.emit('roll', payload)
  })
}

export default roll