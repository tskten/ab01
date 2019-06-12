'use strict';

const isnode= (typeof require === 'function');

const wrtc = isnode?require('wrtc'):window;
const RTCPeerConnection=wrtc.RTCPeerConnection;
const RTCSessionDescription=wrtc.RTCSessionDescription;
const deepstream= isnode?require('deepstream.io-client-js'):window.deepstream;
const EventEmitter = isnode?require('events'):window.EventEmitter;

class Signaling extends EventEmitter {
  constructor(opts) {
    super();
    this.ds=deepstream(opts.server);
    this.ds.login(opts.login,() => this.start());
    this.username=opts.login.username;
  }

  start() {
    this.ds.event.subscribe(`signal/${this.username}`, msg => {
      this.emit(`signal`,msg);
    });
  }

  signal(peer,sig,sid) {
    this.ds.event.emit(`signal/${peer}`,{
      from:this.username,
      signal:sig,
      sid:sid
    });
  }
}

class Peer extends EventEmitter {
  constructor(config,peername) {
    super();

    this.peername=peername;

    this.conn=new RTCPeerConnection(config);
    this.conn.onicecandidate= event => this.onIceCandidate(event);
    this.conn.onconnectionstatechange= event => this.onConnectionStateChange(event);
    this.conn.ondatachannel= event => this.onDataChannel(event);
    
  }

  signal(sig) {
    this.emit('signal',sig);
  }

  onDataChannelOpen() {
    this.emit('channelopen');
  }

  onDataChannelClose() {
    this.emit('channelclosed');
  }

  onDataChannelMessage(event) {
    this.emit('message',JSON.parse(event.data));
  }

  onConnectionStateChange(event) {
    let state=this.conn.connectionState;
    this.emit('debug',`connection with ${this.peername} state: ${state}`);
    if (state=='disconnected') {
      this.close();
    }
  }

  //----------------- send functions
  sendMessage(message) {
    this.emit('debug',`message to ${this.peername}`,message);
    this.mainchannel.send(JSON.stringify(message));
  }

  //----------------- ice related
  onIceCandidate(event) {
    const candidate=event.candidate;
    if (candidate != null) {
      this.signal({
        type: 'candidate',
        candidate: {
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid,
          candidate: candidate.candidate  
        }
      });
    } else {
    }
  }

  //-------------  start a session 
  initiateSession(options=null) {
    this.emit('debug',`send offer to ${this.peername}.`);
    this.mainchannel=this.conn.createDataChannel('main');
    this.mainchannel.onopen= () => this.onDataChannelOpen();
    this.mainchannel.onclose= () => this.onDataChannelClose();
    this.mainchannel.onmessage= (event) => this.onDataChannelMessage(event);
    this.conn.createOffer(options)
      .then(offer => {
        this.conn.setLocalDescription(offer);
        this.signal(offer);
      })
      .catch(e => {console.log('createOffer() error:', e);});
  }

  acceptSession(offer) {
    this.conn.setRemoteDescription(new RTCSessionDescription(offer));
    this.emit('debug',`send answer to ${this.peername}.`);
    this.conn.createAnswer()
      .then(answer => {
        this.conn.setLocalDescription(answer);
        this.signal(answer);
      })
      .catch(e => console.log('createAnswer() error:',e));
  }

  onDataChannel(event) {
    let ch=event.channel;
    if (ch.label=='main') {
      this.mainchannel=event.channel;
      this.mainchannel.onopen= () => this.onDataChannelOpen();
      this.mainchannel.onclose= () => this.onDataChannelClose();
      this.mainchannel.onmessage= (event) => this.onDataChannelMessage(event);
      if (ch.readyState=='open') this.onDataChannelOpen();
    }
    this.emit('datachannel',ch);
  }
  
  handleSignaling(signal) {
    switch (signal.type) {
      case 'answer':
        this.emit('debug',`received answer from ${this.peername}`);
        this.conn.setRemoteDescription(new RTCSessionDescription(signal));
        break;
      case 'candidate':
        this.conn.addIceCandidate(signal.candidate);
        break;
      case 'offer':
        this.acceptSession(signal);
        break;
    }
  }

  cleanup() {
  }

  close() {
    this.cleanup();
    this.conn.close();
    this.emit('close');
  }

}

class Session extends EventEmitter {
  constructor(opts) {
    super();

    this.id=opts.id;

    this.peername=opts.peername;

    this.signaling=opts.signaling;

    this.signalListener= msg => {
      if (msg.sid == this.id && msg.from == this.peername) {
        this.peer.handleSignaling(msg.signal);
      }
    };
    this.signaling.on('signal',this.signalListener);

    this.peer=new Peer(opts.config,opts.peername);
    this.peer.on('signal', signal => this.signaling.signal(this.peername,signal,this.id));
    this.peer.on('message', m => this.emit('message',m));
    this.peer.on('debug', (...l) => this.emit('debug',`.peer:`, ...l));
    this.peer.on('channelopen', () => this.emit('channelopen'));

    if (typeof opts.offer != 'undefined') this.accept(opts.offer);
  }

  initiate() {
    this.peer.initiateSession();
  }

  accept(offer) {
    this.peer.acceptSession(offer);
  }

  sendMessage(message) {
    this.peer.sendMessage(message);
  }

  cleanup() {
    this.signaling.off('signal',this.signalListener);
  }

  close() {
    this.cleanup();
    this.peer.close();
    this.emit('close');
  }

}

if (isnode) {
  module.exports = {
    Signaling:Signaling,
    Peer:Peer,
    Session:Session
  };
}