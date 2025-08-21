/**
 * WebRTC Signaling Server
 * Handles peer connection establishment, ICE candidates, and data channels
 */

class WebRTCSignaling {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this.clients = new Map();
    }
    
    handleConnection(socket) {
        console.log(`WebRTC client connected: ${socket.id}`);
        
        // Store client info
        this.clients.set(socket.id, {
            socket,
            type: null, // 'phone' or 'desktop'
            room: null,
            peerConnection: null
        });
        
        // Handle client type registration
        socket.on('register', (data) => {
            this.handleRegister(socket, data);
        });
        
        // Handle room joining
        socket.on('join-room', (data) => {
            this.handleJoinRoom(socket, data);
        });
        
        // Handle WebRTC signaling
        socket.on('offer', (data) => {
            this.handleOffer(socket, data);
        });
        
        socket.on('answer', (data) => {
            this.handleAnswer(socket, data);
        });
        
        socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(socket, data);
        });
        
        // Handle data channel messages
        socket.on('data-channel-message', (data) => {
            this.handleDataChannelMessage(socket, data);
        });
        
        // Handle disconnection
        socket.on('disconnect', () => {
            this.handleDisconnect(socket);
        });
    }
    
    handleRegister(socket, data) {
        const { type } = data;
        const client = this.clients.get(socket.id);
        
        if (client) {
            client.type = type;
            console.log(`Client ${socket.id} registered as ${type}`);
            
            socket.emit('registered', {
                clientId: socket.id,
                type: type
            });
        }
    }
    
    handleJoinRoom(socket, data) {
        const { roomId } = data;
        const client = this.clients.get(socket.id);
        
        if (!client) return;
        
        // Leave current room if any
        if (client.room) {
            socket.leave(client.room);
            this.removeFromRoom(client.room, socket.id);
        }
        
        // Join new room
        socket.join(roomId);
        client.room = roomId;
        
        // Initialize room if it doesn't exist
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                clients: new Set(),
                created: Date.now()
            });
        }
        
        const room = this.rooms.get(roomId);
        room.clients.add(socket.id);
        
        console.log(`Client ${socket.id} (${client.type}) joined room ${roomId}`);
        
        // Notify other clients in the room
        socket.to(roomId).emit('peer-joined', {
            clientId: socket.id,
            type: client.type
        });
        
        // Send current room state to the new client
        const roomClients = Array.from(room.clients)
            .filter(id => id !== socket.id)
            .map(id => {
                const c = this.clients.get(id);
                return {
                    clientId: id,
                    type: c ? c.type : 'unknown'
                };
            });
        
        socket.emit('room-joined', {
            roomId,
            clients: roomClients
        });
    }
    
    handleOffer(socket, data) {
        const { targetId, offer } = data;
        const client = this.clients.get(socket.id);
        
        if (!client || !client.room) return;
        
        console.log(`Forwarding offer from ${socket.id} to ${targetId}`);
        
        // Forward offer to target client
        socket.to(targetId).emit('offer', {
            fromId: socket.id,
            offer: offer
        });
    }
    
    handleAnswer(socket, data) {
        const { targetId, answer } = data;
        const client = this.clients.get(socket.id);
        
        if (!client || !client.room) return;
        
        console.log(`Forwarding answer from ${socket.id} to ${targetId}`);
        
        // Forward answer to target client
        socket.to(targetId).emit('answer', {
            fromId: socket.id,
            answer: answer
        });
    }
    
    handleIceCandidate(socket, data) {
        const { targetId, candidate } = data;
        const client = this.clients.get(socket.id);
        
        if (!client || !client.room) return;
        
        // Forward ICE candidate to target client
        socket.to(targetId).emit('ice-candidate', {
            fromId: socket.id,
            candidate: candidate
        });
    }
    
    handleDataChannelMessage(socket, data) {
        const { targetId, message } = data;
        const client = this.clients.get(socket.id);
        
        if (!client || !client.room) return;
        
        // Forward data channel message
        socket.to(targetId).emit('data-channel-message', {
            fromId: socket.id,
            message: message
        });
    }
    
    handleDisconnect(socket) {
        const client = this.clients.get(socket.id);
        
        if (client) {
            console.log(`WebRTC client disconnected: ${socket.id} (${client.type})`);
            
            // Remove from room
            if (client.room) {
                this.removeFromRoom(client.room, socket.id);
                
                // Notify other clients in the room
                socket.to(client.room).emit('peer-left', {
                    clientId: socket.id
                });
            }
            
            // Clean up client
            this.clients.delete(socket.id);
        }
    }
    
    removeFromRoom(roomId, clientId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.clients.delete(clientId);
            
            // Remove empty rooms
            if (room.clients.size === 0) {
                this.rooms.delete(roomId);
                console.log(`Room ${roomId} removed (empty)`);
            }
        }
    }
    
    // Utility methods
    getRoomInfo(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        
        const clients = Array.from(room.clients).map(id => {
            const client = this.clients.get(id);
            return {
                clientId: id,
                type: client ? client.type : 'unknown'
            };
        });
        
        return {
            roomId,
            clients,
            created: room.created
        };
    }
    
    getAllRooms() {
        const rooms = [];
        for (const [roomId] of this.rooms) {
            rooms.push(this.getRoomInfo(roomId));
        }
        return rooms;
    }
    
    getClientCount() {
        return this.clients.size;
    }
    
    getRoomCount() {
        return this.rooms.size;
    }
}

module.exports = WebRTCSignaling;
