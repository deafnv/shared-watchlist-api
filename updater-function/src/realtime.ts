import { io } from './function.js'

export type Tables = 'Completed' | 'PTWRolled' | 'PTWCasual' | 'PTWNonCasual' | 'PTWMovies' | 'Seasonal'

export default function emitRealtimeChanges(table: Tables, eventPayload: any) {
  io.emit(table, eventPayload)
}