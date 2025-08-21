/**
 * WebRTC Manager
 * Handles WebRTC peer connections, signaling, and data channels
 */

class WebRTCManager extends EventTarget {
    constructor(socket) {
        super();
        this.socket = socket;
        this.peerConnection = null;
        this.dataChannel = null;
        this.localStream = null;
        this.remoteStream = null;
        
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
        
        this.state = {
            connectionState: 'new',
            iceConnectionState: 'new',
            signalingState: 'stable'
        };
        
        this.setupSocketHandlers();
    }
    
    async initialize() {
        try {
            this.createPeerConnection();
            this.setupDataChannel();
            console.log('WebRTC Manager initialized');
        } catch (error) {
            console.error('Failed to initialize WebRTC Manager:', error);
            throw error;
        }
    }
    
    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.config);
        
        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            this.state.connectionState = this.peerConnection.connectionState;
            console.log('Connection state:', this.state.connectionState);
            this.dispatchEvent(new CustomEvent('connectionStateChange', {
                detail: this.state.connectionState
            }));
        };
        
        // Handle ICE connection state changes
        this.peerConnection.oniceconnectionstatechange = () => {
            this.state.iceConnectionState = this.peerConnection.iceConnectionState;
            console.log('ICE connection state:', this.state.iceConnectionState);
        };
        
        // Handle signaling state changes
        this.peerConnection.onsignalingstatechange = () => {
            this.state.signalingState = this.peerConnection.signalingState;
            console.log('Signaling state:', this.state.signalingState);
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: this.remoteClientId,
                    candidate: event.candidate
                });
            }
        };
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('Received remote track');
            this.remoteStream = event.streams[0];
            this.dispatchEvent(new CustomEvent('remoteStream', {
                detail: this.remoteStream
            }));
        };
        
        // Handle data channel from remote peer
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannelHandlers(channel);
        };
    }
    
    setupDataChannel() {
        // Create data channel for sending detection requests
        this.dataChannel = this.peerConnection.createDataChannel('detection', {
            ordered: true,
            maxRetransmits: 3
        });
        
        this.setupDataChannelHandlers(this.dataChannel);
    }
    
    setupDataChannelHandlers(channel) {
        channel.onopen = () => {
            console.log('Data channel opened:', channel.label);
        };
        
        channel.onclose = () => {
            console.log('Data channel closed:', channel.label);
        };
        
        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };
        
        channel.onmessage = (event) => {
            this.dispatchEvent(new CustomEvent('dataChannelMessage', {
                detail: event.data
            }));
        };
        
        // Store reference to the channel
        if (channel.label === 'detection') {
            this.dataChannel = channel;
        }
    }
    
    setupSocketHandlers() {
        this.socket.on('peer-joined', (data) => {
            console.log('Peer joined:', data);
            if (data.type === 'phone') {
                this.remoteClientId = data.clientId;
                this.createOffer();
            }
        });
        
        this.socket.on('offer', async (data) => {
            console.log('Received offer from:', data.fromId);
            await this.handleOffer(data.offer);
        });
        
        this.socket.on('answer', async (data) => {
            console.log('Received answer from:', data.fromId);
            await this.handleAnswer(data.answer);
        });
        
        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate from:', data.fromId);
            await this.handleIceCandidate(data.candidate);
        });
        
        this.socket.on('peer-left', (data) => {
            console.log('Peer left:', data.clientId);
            if (data.clientId === this.remoteClientId) {
                this.handlePeerDisconnection();
            }
        });
    }
    
    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: false
            });
            
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                targetId: this.remoteClientId,
                offer: offer
            });
            
            console.log('Offer created and sent');
        } catch (error) {
            console.error('Failed to create offer:', error);
        }
    }
    
    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(offer);
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                targetId: this.remoteClientId,
                answer: answer
            });
            
            console.log('Answer created and sent');
        } catch (error) {
            console.error('Failed to handle offer:', error);
        }
    }
    
    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(answer);
            console.log('Answer processed');
        } catch (error) {
            console.error('Failed to handle answer:', error);
        }
    }
    
    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(candidate);
            console.log('ICE candidate added');
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }
    
    handlePeerDisconnection() {
        console.log('Handling peer disconnection');
        this.remoteStream = null;
        this.remoteClientId = null;
        
        this.dispatchEvent(new CustomEvent('peerDisconnected'));
    }
    
    sendDataChannelMessage(message) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(message));
            return true;
        }
        return false;
    }
    
    getConnectionStats() {
        if (!this.peerConnection) return null;
        
        return this.peerConnection.getStats().then(stats => {
            const result = {};
            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                    result.inboundVideo = report;
                } else if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                    result.outboundVideo = report;
                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    result.candidatePair = report;
                }
            });
            return result;
        });
    }
    
    cleanup() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.remoteStream = null;
        this.remoteClientId = null;
        
        console.log('WebRTC Manager cleaned up');
    }
}

export { WebRTCManager };
