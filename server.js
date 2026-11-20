const express=require('express'), http=require('http'), {Server}=require('socket.io');
const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static('public'));
const COLORS=['red','blue','green','yellow'], START={red:0,blue:13,green:26,yellow:39};
const safe=[0,8,13,21,26,34,39,47];
const rooms={};
function fresh(){return {players:[],tokens:{red:[-1,-1,-1,-1],blue:[-1,-1,-1,-1],green:[-1,-1,-1,-1],yellow:[-1,-1,-1,-1]},turn:0,dice:null,rolled:false,finished:null,log:'بانتظار اللاعبين…'}}
function snap(r){return {...r}}
function broadcast(room){io.to(room).emit('state',snap(rooms[room]))}
io.on('connection',socket=>{
 socket.on('join',({room,name,color})=>{room=(room||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);if(!room)room=Math.random().toString(36).slice(2,7).toUpperCase();if(!rooms[room])rooms[room]=fresh();let r=rooms[room];let chosen=color&&COLORS.includes(color)&&!r.players.some(p=>p.color===color)?color:COLORS.find(c=>!r.players.some(p=>p.color===c));if(r.players.length>=4||!chosen){socket.emit('err','الغرفة ممتلئة');return}let p={id:socket.id,name:(name||'لاعب').slice(0,16),color:chosen};r.players.push(p);socket.join(room);socket.data.room=room;socket.data.color=chosen;socket.emit('joined',{room,color:chosen});r.log=`${p.name} دخل اللعب 🎉`;broadcast(room)});
 socket.on('roll',()=>{let room=socket.data.room,r=rooms[room];if(!r||r.players[r.turn]?.id!==socket.id||r.rolled||r.finished)return; r.dice=1+Math.floor(Math.random()*6);r.rolled=true;r.log=`${r.players[r.turn].name} رمى ${r.dice} 🎲`;broadcast(room)});
 socket.on('move',idx=>{let room=socket.data.room,r=rooms[room];if(!r||!r.rolled||r.players[r.turn]?.id!==socket.id||r.finished)return;let c=r.players[r.turn].color,progress=r.tokens[c][idx],d=r.dice;if(progress===-1&&d!==6)return;if(progress===-1)progress=0;else progress+=d;if(progress>57)return;r.tokens[c][idx]=progress;let landed=(START[c]+progress)%52;let captured=[];if(progress>0&&progress<57&&!safe.includes(landed%52)){for(let op of r.players){if(op.color===c)continue;r.tokens[op.color].forEach((v,i)=>{if(v>=0&&v<52&&((START[op.color]+v)%52)===landed%52){r.tokens[op.color][i]=-1;captured.push(op.name)}})}}if(r.tokens[c].every(v=>v===57)){r.finished=c;r.log=`🏆 ${r.players[r.turn].name} فاز!`;r.rolled=false;r.dice=null;broadcast(room);return}r.log=captured.length?`💥 ${r.players[r.turn].name} أرسل ${captured.join(' و')} إلى البداية!`: `تحرك حجر ${r.players[r.turn].name}`;if(d!==6){r.turn=(r.turn+1)%r.players.length}r.rolled=false;r.dice=null;broadcast(room)});
 socket.on('emoji',e=>{let room=socket.data.room,r=rooms[room];if(r&&['😂','😎','😡','😜','😭','😱','👏','🔥','👑','🏁','🤡','💀'].includes(e))io.to(room).emit('emoji',{from:r.players.find(p=>p.id===socket.id)?.name,e})});
 socket.on('disconnect',()=>{let room=socket.data.room,r=rooms[room];if(!r)return;r.players=r.players.filter(p=>p.id!==socket.id);if(!r.players.length)delete rooms[room];else{r.turn=Math.min(r.turn,r.players.length-1);r.rolled=false;r.dice=null;r.log='أحد اللاعبين غادر الغرفة';broadcast(room)}})
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Ludo Party running on http://localhost:'+(process.env.PORT||3000)));
