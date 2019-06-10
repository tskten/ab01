'use strict';

const rtcconfig={
    iceServers: [{urls:'stun:stun2.l.google.com:19302'}]
}

class BobSession extends Session {
  constructor(opts) {
    super(opts);

    this.peer.on('message', msg => {
      this.emit('debug',`received message:`, msg);
      switch (msg.type) {
        case 'cmdresult':
          this.handleCmdresult(msg);
      }
    });

    this.cid=0;
    this.cmdHistory=[];
  }

  cmd(cmd) {
    cmd.cid=this.cid;
    let res=new EventEmitter();
    this.cmdHistory[this.cid]={
      cmd:cmd,
      res:res
    };
    ++this.cid;
    this.sendMessage({
      type:'cmd',
      cmd:cmd
    });
    return res;
  }

  ls(path) {
    return this.cmd({cmd:'ls',path:path});
  }

  handleCmdresult(msg) {
    let c=this.cmdHistory[msg.cid];
    if (typeof msg.err != 'undefined') {
      this.emit('debug', 'error', c);
      return;
    }
    this.emit('cmdresult',{cmd:c,result:msg.result});
    c.res.emit('result',msg.result);
  }
}

let login={type: 'file',username: 'bob',password: 'bobpassword'};

const serverUrl='wss://server.url';

const signalingOptions= {
  server:serverUrl,
  login: login
}

let peername='alice';

let currentDir='';

function cd(dir) {
  let d0=`${currentDir}/${dir}`.split('/'),d1=[];
  for (let d of d0) {
    if (d.length==0) continue;
    if (d=='..') {
      d1.pop();
    } else {
      d1.push(d);
    }
  }
  let nd=d1.join('/');
  let res=sess.ls(nd);
  res.on('result', r => {
    currentDir=nd;
    let fl=document.getElementById('flist');
    fl.parentElement.replaceChild(fileList(r),fl);
  });
}


function fileEntry(f) {
  let e=document.createElement('li');
  e.classList.add(f.type);
  e.append(f.name);
  if (f.type=='dir') {
    e.addEventListener('click', () => {
      cd(f.name);
    });
  }
  return e;
}

function fileList(fl) {
  let e=document.createElement('ul');
  e.setAttribute('id','flist');
  if (currentDir.length>0) e.append(fileEntry({name:'..',type:'dir'}));
  for (let f of fl) {
    e.append(fileEntry(f));
  }
  return e;
}

function randStr(len) {
  const t='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s='';
  for (let i=0;i<len;i++) {
    s+=t[Math.floor(Math.random()*62)];
  }
  return s;
}

function start() {
  let s=new Signaling(signalingOptions);
  let nid=randStr(16);
  s.on('signal', msg => {
    const sig=msg.signal;
    if (sig.type=='newans' && sig.nid == nid) {
      const opts={
        id:sig.sid,
        peername:msg.from,
        signaling:s,
        config:rtcconfig,
      };
      const sess=new BobSession(opts);
      sess.on('debug', (...l) => console.log(`D]${sess.id}:`, ...l));
      sess.on('message', (...m) => console.log(`M]${sess.id}`, ...m));
      sess.on('channelopen', () => {console.log('CO'),cd('')});
      window.sess=sess;
    }
  });
  s.signal(peername,{type:'new',nid:nid});
}

start();
