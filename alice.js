'use strict';

const _common=require('./common');
const fs=require('fs');
const path=require('path');
const conf=require('./alice.conf');
//const EventEmitter=require('events');
//const Peer=_common.Peer;
const Signaling=_common.Signaling;
const Session=_common.Session;

const rtcconfig={
  iceServers: [{urls:'stun:stun2.l.google.com:19302'}]
};

const sessions={};

const signaling=new Signaling(conf.signalingOptions);

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
      e.type='dir';
    } else if (stat.isFile()) {
      e.type='file';
      e.size=stat.size;
    } else {
      continue;
    }
    ret.push(e);
  }
  ret.sort((a,b) => {
    if (a.type!=b.type) {
      return (a.type=='dir')?-1:1;
    }
    return a.mtime>b.mtime?-1:1;
  });
  return ret;
}

function isAncDir(a,b) {
  let rel=path.relative(a,b);
  return rel == '..' || rel.startsWith('../');
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
        this.handleLs(cmd,ret);
        break;
      case 'download':
        this.handleDownload(cmd,ret);
        break;
      }
  }

  handleLs(cmd,ret) {
    let p=cmd.path;
    p=path.resolve(`${exportRoot}/${p}`);
    if (isAncDir(exportRoot,p)) {
      ret.err='no such file or directory';
    } else {
      try {
        ret.result=dirInfo(p);
      } catch (e) {
        ret.err=errStr(e);
      }
    }
    this.sendMessage(ret);
  }

  handleDownload(cmd,ret) {
    ;
  }
}

function hhmmssnow() {
  return (new Date).toTimeString().slice(0,8);
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
  };
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
    s.on('debug', (...log) => console.log(`${hhmmssnow()} D]${sid}:`, ...log));
  }
});