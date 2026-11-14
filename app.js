import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { io } from 'https://cdn.socket.io/4.8.1/socket.io.esm.min.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

// Fill these with the Supabase Project URL and publishable key (safe for browser use).
const SUPABASE_URL = window.SKY_SUPABASE_URL || 'https://ceasqdjszippcvdgtqxj.supabase.co';
const SUPABASE_ANON_KEY = window.SKY_SUPABASE_ANON_KEY || 'sb_publishable_x5BMLiShNrZiQwYLRH5sxg_Kh8F4NLh';
const configured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
const $ = id => document.getElementById(id);
let mode = 'free', session = null, me = null, socket = null, currentTab = 'login';

function setupScene() {
  const host = $('scene');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080d18); scene.fog = new THREE.FogExp2(0x080d18, .012);
  const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, .1, 1200); camera.position.set(0, 10, 24);
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false }); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0x8edfff,0x101a2a,1.6));
  const light = new THREE.PointLight(0x24dfff,35,160); light.position.set(0,35,0); scene.add(light);
  const grid = new THREE.GridHelper(500,100,0x1a7591,0x16344b); grid.position.y=-.15; scene.add(grid);
  const matA = new THREE.MeshStandardMaterial({color:0x102b42, emissive:0x06283c, metalness:.7, roughness:.4});
  const matB = new THREE.MeshStandardMaterial({color:0x16223a, emissive:0x111b35, metalness:.5, roughness:.5});
  for(let i=0;i<180;i++){const h=3+Math.random()*30,w=2+Math.random()*5,d=2+Math.random()*5;const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),i%2?matA:matB);const x=(Math.random()-.5)*260,z=(Math.random()-.5)*260;if(Math.abs(x)<13&&Math.abs(z)<25)continue;m.position.set(x,h/2,z);scene.add(m);const edge=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:i%3?0x1bbbd5:0x9cff63,transparent:true,opacity:.35}));edge.position.copy(m.position);scene.add(edge);}
  const drone = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1.5,.35,1.1),new THREE.MeshStandardMaterial({color:0x9cff63,metalness:.8,roughness:.2,emissive:0x183d12}));drone.add(body);
  for(const [x,z] of [[-.9,-.8],[.9,-.8],[-.9,.8],[.9,.8]]){const arm=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,1.2),new THREE.MeshStandardMaterial({color:0x50e7ff}));arm.rotation.z=Math.PI/2;arm.position.set(x*.42,.05,z*.42);drone.add(arm);const rotor=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.05,24),new THREE.MeshBasicMaterial({color:0x50e7ff,transparent:true,opacity:.5}));rotor.position.set(x, .2,z);drone.add(rotor);}
  scene.add(drone); const state={x:0,y:8,z:0,yaw:0,speed:0}; const keys={}; addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
  function animate(){requestAnimationFrame(animate);const dt=.016;const accel=keys.shift?.045:.018;state.speed+=(keys.w?accel:keys.s?-.02:0);state.speed*=.985;state.speed=Math.max(-.7,Math.min(1.3,state.speed));state.yaw+=(keys.a?.025:keys.d?-.025:0);state.y+=keys.arrowup?.12:keys.arrowdown?-.12:0;state.y=Math.max(1,Math.min(100,state.y));state.x+=Math.sin(state.yaw)*state.speed;state.z+=Math.cos(state.yaw)*state.speed;drone.position.set(state.x,state.y,state.z);drone.rotation.y=state.yaw;drone.rotation.z=(keys.a?.15:keys.d?-.15:0);camera.position.lerp(new THREE.Vector3(state.x-Math.sin(state.yaw)*13,state.y+6,state.z-Math.cos(state.yaw)*13),.08);camera.lookAt(drone.position);renderer.render(scene,camera);if(socket?.connected&&Math.random()<.25)socket.emit('drone:state',state);}
  animate();
}
setupScene();

function authMessage(msg, bad=false){$('authMessage').textContent=msg;$('authMessage').style.color=bad?'#ff9999':'#a4ff68'}
function api(path, options={}) {return fetch(path,{...options,headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token||''}`,...options.headers}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Xatolik');return d;});}
function setTab(tab){currentTab=tab;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('usernameWrap').classList.toggle('hidden',tab!=='register');$('authSubmit').innerHTML=tab==='login'?'Kirish <span>↗</span>':'Hisob yaratish <span>↗</span>';}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!configured)return authMessage('Avval client/app.js ichida Supabase URL va publishable key kiriting.',true);const email=$('email').value.trim(),password=$('password').value,username=$('username').value.trim();try{if(currentTab==='register'){if(!/^[A-Za-z0-9_]{3,20}$/.test(username))throw new Error('Username 3–20 belgi, faqat harf, raqam va _ bo‘lsin.');const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username,display_name:username}}});if(error)throw error;if(!data.session){authMessage('Emailingizga tasdiqlash xabari yuborildi. Tasdiqlab, keyin kiring.');return;}session=data.session;}else{const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;session=data.session;}await enterApp();}catch(err){authMessage(err.message,true);}});
$('logoutBtn').addEventListener('click',async()=>{await supabase?.auth.signOut();session=null;me=null;socket?.disconnect();$('appPanel').classList.add('hidden');$('authPanel').classList.remove('hidden');$('logoutBtn').classList.add('hidden');});
async function enterApp(){if(!session)return;try{me=await api('/api/me');$('authPanel').classList.add('hidden');$('appPanel').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');$('pilotName').textContent=me.profile?.display_name||me.profile?.username||'Pilot';$('profileUsername').textContent='@'+(me.profile?.username||'—');$('profileStatus').textContent=me.premium?'PREMIUM':'FREE';$('premiumChip').textContent=me.premium?'◇ PREMIUM PILOT':'◇ FREE PILOT';$('premiumExpiry').textContent=me.entitlement?.expires_at?new Date(me.entitlement.expires_at).toLocaleDateString():(me.premium?'Cheklanmagan':'—');$('adminPanel').classList.toggle('hidden',me.profile?.role!=='admin');connectSocket();loadLeaderboard();if(me.profile?.role==='admin')loadUsers();}catch(e){authMessage(e.message,true);}}
async function loadLeaderboard(){try{const {leaderboard}=await api('/api/leaderboard');$('leaderboard').innerHTML=leaderboard.length?leaderboard.map((r,i)=>`<div class="leaderboard-row"><span>${i+1}. @${esc(r.profiles?.username||'Pilot')}</span><b>${Number(r.score).toLocaleString()}</b></div>`).join(''):'<p class="muted">Hozircha natijalar yo‘q.</p>';}catch(e){$('leaderboard').textContent=e.message;}}
function connectSocket(){socket?.disconnect();socket=io({auth:{token:session.access_token}});socket.on('connect',()=>$('connection').textContent='● ONLINE');socket.on('disconnect',()=>$('connection').textContent='● OFFLINE');socket.on('room:error',m=>$('roomMessage').textContent=m);socket.on('room:players',players=>$('roomPlayers').innerHTML=players.map(p=>`<span class="player-pill">@${esc(p.username)}</span>`).join(''));socket.on('drone:remote',()=>{});}
$('createRoom').addEventListener('click',async()=>{try{const {room}=await api('/api/rooms',{method:'POST',body:JSON.stringify({name:$('roomName').value})});$('roomCode').value=room.room_code;$('roomMessage').textContent='Xona yaratildi. Kod: '+room.room_code;socket?.emit('room:join',{code:room.room_code});}catch(e){$('roomMessage').textContent=e.message;}});
$('joinRoom').addEventListener('click',()=>{const code=$('roomCode').value.trim().toUpperCase();if(!code)return $('roomMessage').textContent='Xona kodini kiriting.';socket?.emit('room:join',{code});$('roomMessage').textContent='Xonaga ulanish so‘rovi yuborildi.';});
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('active',x===b));}));
$('searchUsers').addEventListener('click',loadUsers);
async function loadUsers(){try{const q=encodeURIComponent($('userSearch').value.trim());const {users}=await api('/api/admin/users?q='+q);$('userResults').innerHTML=users.length?users.map(u=>`<div class="user-row"><div><b>@${esc(u.username)}</b><small>${u.role==='admin'?'ADMIN':'PLAYER'} · ${u.premium?.is_active?'Premium yozuvi mavjud':'Free'}</small></div><button class="secondary" data-grant="${u.id}">Premium berish</button><button class="secondary revoke" data-revoke="${u.id}">Bekor qilish</button></div>`).join(''):'<p class="muted">Foydalanuvchi topilmadi.</p>';document.querySelectorAll('[data-grant]').forEach(b=>b.onclick=()=>changePremium(b.dataset.grant,'grant'));document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>changePremium(b.dataset.revoke,'revoke'));}catch(e){$('adminMessage').textContent=e.message;}}
async function changePremium(userId,action){const days=action==='grant'?prompt('Premium necha kun? Bo‘sh qoldirsangiz muddatsiz:','30'):null;if(days===null&&action==='grant')return;if(days!==null&&days.trim()&&!/^\d+$/.test(days.trim()))return $('adminMessage').textContent='Kun soni raqam bo‘lishi kerak.';const expiresAt=days?.trim()?new Date(Date.now()+Number(days)*86400000).toISOString():null;const note=prompt('Izoh (ixtiyoriy):','Admin tomonidan berildi')||'';try{const result=await api('/api/admin/premium',{method:'POST',body:JSON.stringify({userId,action,expiresAt,note})});$('adminMessage').textContent=result.message;loadUsers();}catch(e){$('adminMessage').textContent=e.message;}}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
if(configured){
  supabase.auth.getSession().then(({data})=>{session=data.session;if(session)enterApp();});
  supabase.auth.onAuthStateChange((event,s)=>{
    session=s;
    if(s && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) enterApp();
    if(event === 'SIGNED_OUT'){
      me=null; socket?.disconnect();
      $('appPanel').classList.add('hidden'); $('authPanel').classList.remove('hidden');
      $('logoutBtn').classList.add('hidden');
    }
  });
}else{$('connection').textContent='● SETUP REQUIRED';authMessage('Supabase sozlamalarini kiriting: client/app.js va server .env.',true);}
