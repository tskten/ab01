'use strict';

const _common=require('./common');
const fs=require('fs');
const path=require('path');
//const EventEmitter=require('events');
//const Peer=_common.Peer;
const Signaling=_common.Signaling;
const Session=_common.Session;

const login={type: 'file',username: 'alice',password: 'alicepassword'};

const serverUrl='wss://server.url';

const signalingOptions= {
  server:serverUrl,
  login: login
}

const rtcconfig={
  iceServers: [{urls:'stun:stun2.l.google.com:19302'}]
};

const sessions={};

const signaling=new Signaling(signalingOptions);

const exportRoot='./storage';

function errStr(e) {
  const s={
    '-2':'no such file or directory',
    '-13':'permission denied',
    '-20':'not a directory',
  };
  return s[e.errno]?s[e.errno]:`${e.errno}`;
}

function dirInfo(dir) {
  let ret=[];
  const list=fs.readdirSync(dir);
  for (let f of list) {
    const stat=fs.statSync(path.resolve(dir,f));
    let e={name:f,mtime:stat.mtime};
    if (stat.isDirectory()) {
      e.type='dir'
    } else if (stat.isFile()) {
      e.type='file'
      e.size=stat.size;
    } else {
      continue;
    }
    ret.push(e);
  }
  return ret;
}

class AliceSession extends Session {
  constructor(opts) {
    super(opts);

    this.peer.on('message', msg => {
      this.emit('debug',`received message:`, msg);
      switch (msg.type) {
        case 'cmd':
          this.handleCmd(msg.cmd);
      }
    });
  }

  handleCmd(cmd) {
    let ret={
      type:'cmdresult',
      cid:cmd.cid
    };
    switch (cmd.cmd) {
      case 'ls':
        let p=cmd.path,i;
        for (i=0;i<p.length && p[i]=='/'; ++i)
          ;
        if (i>0) p=p.slice(i);
        p=path.resolve(exportRoot,p);
        let rel=path.relative(exportRoot,p);
        if (rel == '..' || rel.startsWith('../')) {
          ret.err='no such file or directory';
        } else {
          try {
            ret.result=dirInfo(p);
          } catch (e) {
            ret.err=errStr(e);
          }
        }
        this.sendMessage(ret);
        break;
      }
  }
}

function randStr(len) {
  const t='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s='';
  for (let i=0;i<len;i++) {
    s+=t[Math.floor(Math.random()*62)];
  }
  return s;
}

function newSid() {
  let id=randStr(8);
  while (sessions.hasOwnProperty(id)) {
    id=randStr(8);
  }
  return id;
}

function newSession(peername,id) {
  const opts={
    id:id,
    peername:peername,
    signaling:signaling,
    config:rtcconfig,
  }
  sessions[id]=new AliceSession(opts);
  return sessions[id];
}

signaling.on('signal', msg => {
  if (msg.signal.type=='new') {
    let sid=newSid();
    signaling.signal(msg.from,{
      type:'newans',
      nid:msg.signal.nid,
      sid:sid
    });
    const s=newSession(msg.from,sid);
    s.initiate();
    //s.on('message',console.log);
    s.on('debug', (...log) => console.log(`D]${sid}:`, ...log));
  }
});