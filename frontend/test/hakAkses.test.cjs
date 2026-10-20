const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const vue=require('vue');
const root=path.join(__dirname,'../src');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const script=file=>read(file).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const compile=(source,deps={},globals={})=>{
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:id=>deps[id]||{},...globals});return module.exports;
};
const helpers=compile(read('utils/userPermissions.ts'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
const wire=(id=1,view='Y',insert='N',edit='N',del='N')=>({men_id:id,men_nama:'frmTest'+id,men_keterangan:'Modul '+id,men_modul:1,view,insert,edit,delete:del,hak_men_insert:insert,hak_men_edit:edit,hak_men_delete:del});
function fixture({initial='U1',canEdit=true,actor='ADMIN',getRights,put,refresh,confirm=true,failUsers=false}={}){
 const mounted=[],unmounted=[],guards=[],calls=[];
 const server={U1:[wire()],U2:[wire(2)]};
 const tabId='/setting/hak-akses?kode='+initial;
 const tabs={tabs:[{id:tabId,title:'Hak Akses'},{id:'/other',title:'Other tab'}],generateTabId:()=>tabId};
 const notices=[];const rows={};
 const auth={isAuthenticated:true,user:{user_kode:actor},can:(_form,action)=>action==='edit'?canEdit:rows.view!==false,refreshProfile:async()=>{calls.push({refresh:true});await refresh?.(rows);}};
 const api={async get(url){calls.push({method:'get',url});if(url==='/master/user'){if(failUsers)throw Error('Users failed');return{data:{data:[{Kode:'U1',Nama:'One'},{Kode:'U2',Nama:'Two'}]}};}const code=decodeURIComponent(url.split('/').at(-2));return{data:{data:getRights?await getRights(code):server[code]||[]}};},
 async put(url,body){calls.push({method:'put',url,body});if(put)return put(url,body,server);const code=decodeURIComponent(url.split('/').at(-2));server[code]=body.items.map(item=>wire(item.men_id,item.view,item.insert,item.edit,item.delete));return{data:{message:'Saved'}};}};
 const deps={vue:{...vue,onMounted:fn=>mounted.push(fn),onUnmounted:fn=>unmounted.push(fn)},'vue-router':{useRoute:()=>({query:{kode:initial}}),useRouter:()=>({back(){},replace:async url=>calls.push({route:url,allowed:guards.every(guard=>guard())})}),onBeforeRouteLeave:fn=>guards.push(fn)},
 'vue-toastification':{useToast:()=>({success:message=>notices.push(message),error:message=>notices.push(message)})},'@/api/axios':{api,getErrorMessage:(err,fallback)=>err?.response?.data?.message||err?.message||fallback},'@/stores/authStore':{useAuthStore:()=>auth},'@/stores/permissionStore':{usePermissionStore:()=>({build:()=>calls.push({build:true})})},'@/stores/tabsStore':{useTabsStore:()=>tabs},'@/utils/userPermissions':helpers};
 const form=compile(script('views/setting/HakAksesView.vue')+'\nexport {items,kodeAktif,loadedKode,loaded,memuat,menyimpan,loadError,canSave,dirty,toggle,setAll,load,gantiUser,simpan};',deps,{window:{confirm:()=>confirm}});
 return{...form,server,calls,notices,guards,auth,tabs,mount:async()=>{for(const fn of mounted)await fn();},dispose:()=>unmounted.forEach(fn=>fn())};
}
test('Y/N helpers round-trip read-only rights and reject numeric/boolean wire flags',()=>{
 const row=helpers.permissionFromApi(wire());
 assert.equal(row.view,true);assert.equal(row.insert,false);
 assert.deepEqual({...helpers.permissionToApi(row)},{men_id:1,view:'Y',insert:'N',edit:'N',delete:'N'});
 helpers.changePermission(row,'edit',true);assert.equal(row.view,true);assert.equal(row.edit,true);
 helpers.changePermission(row,'view',false);for(const key of ['view','insert','edit','delete'])assert.equal(row[key],false);
 for(const value of [0,1,'0','1',false,true])assert.throws(()=>helpers.permissionFromApi({...wire(),view:value}),/Y\/N/);
});
test('Loading uses actual flags; read-only record survives Save with explicit Y/N API payload',async()=>{
 const f=fixture();try{await f.mount();assert.equal(f.tabs.tabs[0].title,'Hak Akses \u00b7 One');assert.equal(f.tabs.tabs[1].title,'Other tab');assert.equal(f.canSave.value,true);assert.equal(f.items.value[0].view,true);assert.equal(f.items.value[0].edit,false);
 await f.simpan();const call=f.calls.find(c=>c.method==='put');assert.equal(call.url,'/master/user/U1/hak');assert.equal(call.body.user_kode,'U1');
 assert.deepEqual({...call.body.items[0]},{men_id:1,view:'Y',insert:'N',edit:'N',delete:'N'});assert.equal(f.items.value[0].view,true);assert.equal(f.dirty.value,false);
 }finally{f.dispose();}
});
test('Enabling an action enables view; clearing view clears every action and tracks dirty state',async()=>{
 const f=fixture();try{await f.mount();const item=f.items.value[0];f.toggle(item,'view',false);assert.equal(f.dirty.value,true);
 f.toggle(item,'insert',true);assert.equal(item.view,true);assert.equal(item.insert,true);f.setAll(f.items.value,'view',false);
 for(const key of ['view','insert','edit','delete'])assert.equal(item[key],false);
 await f.simpan();assert.equal(f.calls.find(c=>c.method==='put').body.items[0].view,'N');
 }finally{f.dispose();}
});
test('Read-only admin cannot toggle/save; failed load and pending load disable Save',async()=>{
 const denied=fixture({canEdit:false}),failed=fixture({getRights:async()=>{throw Error('Failed');}}),pending=deferred(),loading=fixture({getRights:()=>pending.promise});
 try{await denied.mount();denied.toggle(denied.items.value[0],'edit',true);await denied.simpan();assert.equal(denied.canSave.value,false);assert.equal(denied.items.value[0].edit,false);assert.ok(!denied.calls.some(c=>c.method==='put'));
 await failed.mount();assert.equal(failed.canSave.value,false);await failed.simpan();assert.equal(failed.loadError.value,'Failed');
 const mounting=loading.mount();await new Promise(setImmediate);assert.equal(loading.canSave.value,false);pending.resolve([wire()]);await mounting;assert.equal(loading.canSave.value,true);
 }finally{denied.dispose();failed.dispose();loading.dispose();}
});
test('Late user response cannot overwrite a newer selection',async()=>{
 const slow=deferred();const f=fixture({getRights:code=>code==='U1'?slow.promise:Promise.resolve([wire(2)])});
 try{const first=f.load('U1');f.kodeAktif.value='U2';await f.gantiUser();slow.resolve([wire(1)]);await first;
 assert.equal(f.loadedKode.value,'U2');assert.equal(f.tabs.tabs[1].title,'Other tab');assert.equal(f.items.value[0].men_id,2);assert.equal(f.canSave.value,true);
 }finally{f.dispose();}
});
test('Declining discard restores selected user; route leave guard protects unsaved changes but allows logout',async()=>{
 const f=fixture({confirm:false});try{await f.mount();f.toggle(f.items.value[0],'edit',true);f.kodeAktif.value='U2';await f.gantiUser();assert.equal(f.kodeAktif.value,'U1');assert.equal(f.loadedKode.value,'U1');assert.equal(f.guards[0](),false);f.auth.isAuthenticated=false;assert.equal(f.guards[0](),true);
 }finally{f.dispose();}
});
test('Save failure reloads actual partial state and shows error rather than claiming rollback',async()=>{
 const f=fixture({put:async(_url,_body,server)=>{server.U1=[wire(1,'Y','N','Y')];throw{response:{data:{message:'Sebagian perubahan mungkin tersimpan',reload_required:true}}};}});
 try{await f.mount();f.toggle(f.items.value[0],'insert',true);await f.simpan();assert.equal(f.items.value[0].edit,true);assert.equal(f.items.value[0].insert,false);assert.equal(f.dirty.value,false);assert.match(f.loadError.value,/Sebagian perubahan/);assert.equal(f.canSave.value,true);
 }finally{f.dispose();}
});
test('Saving own rights refreshes profile/sidebar and leaves page if view permission was revoked',async()=>{
 const f=fixture({actor:'U1',refresh:async rows=>{rows.view=false;}});try{await f.mount();f.toggle(f.items.value[0],'view',false);await f.simpan();assert.ok(f.calls.some(c=>c.refresh));assert.ok(f.calls.some(c=>c.build));assert.ok(f.calls.some(c=>c.route==='/dashboard'&&c.allowed));assert.equal(f.loaded.value,false);
 }finally{f.dispose();}
});
test('Disposed permission view ignores late responses',async()=>{
 const slow=deferred(),f=fixture({getRights:()=>slow.promise});const pending=f.load('U1');f.dispose();slow.resolve([wire()]);await pending;assert.equal(f.items.value.length,0);assert.equal(f.loaded.value,false);
});
function userForm({edit=false,denied=false,failDetail=false}={}){
 const calls=[],mounted=[],route={params:{},query:edit?{id:'U1'}:{}};
 const api={get:async url=>{calls.push({method:'get',url});if(url==='/master/lookup')return{data:{data:{pabrik:[{Kode:'P1',Nama:'One'}]}}};if(failDetail)throw Error('Missing');return{data:{data:{Kode:'U1',Nama:'Existing',Cabang:null,Edit:0,Dibuat:'2026-01-01',USER_PASSWORD:'NeverCopy'}}};},put:async(url,body)=>calls.push({method:'put',url,body}),post:async(url,body)=>calls.push({method:'post',url,body})};
 const deps={vue:{...vue,onMounted:fn=>mounted.push(fn)},'vue-router':{useRoute:()=>route},'vue-toastification':{useToast:()=>({error(){}})},'@/api/axios':{api,getErrorMessage:()=> 'Load failed'},'@/stores/authStore':{useAuthStore:()=>({user:{user_kode:'ADMIN'},can:()=>!denied})},'@/stores/permissionStore':{usePermissionStore:()=>({build(){}})}};
 const form=compile(script('views/setting/UserForm.vue')+'\nexport {values,errors,simpan,ready};',deps);
 return{...form,calls,route,mount:async()=>{for(const fn of mounted)await fn();}};
}
test('User edit maps API names, represents NULL as Semua Pabrik, keeps identity stable and excludes password',async()=>{
 const f=userForm({edit:true});await f.mount();assert.equal(f.values.user_kode,'U1');assert.equal(f.values.user_nama,'Existing');assert.equal(f.values.user_akses,'');assert.equal(f.values.user_password,'');
 f.values.user_password='DoNotSend';f.values.user_akses='P1';f.route.query.id='OTHER';await f.simpan();const call=f.calls.at(-1);assert.equal(call.url,'/master/user/U1');assert.equal(call.body.user_kode,'U1');assert.equal(call.body.user_akses,'P1');assert.ok(!('user_password'in call.body));
});
test('User create requires initial password and validates lengths; Semua Pabrik stays empty',async()=>{
 const f=userForm();await f.mount();Object.assign(f.values,{user_kode:'NEW',user_nama:'New',user_akses:''});await assert.rejects(f.simpan(),/Periksa/);
 f.values.user_password=' Secret ';await f.simpan();const call=f.calls.at(-1);assert.equal(call.method,'post');assert.equal(call.body.user_password,' Secret ');assert.equal(call.body.user_akses,'');
 for(const[field,value]of [['user_kode','x'.repeat(11)],['user_nama','x'.repeat(31)],['user_password','x'.repeat(16)],['user_akses','x'.repeat(6)]]){const old=f.values[field];f.values[field]=value;await assert.rejects(f.simpan(),/Periksa/);f.values[field]=old;}
 const denied=userForm({denied:true});await denied.mount();await assert.rejects(denied.simpan(),/Tidak memiliki hak/);
 const failed=userForm({edit:true,failDetail:true});await failed.mount();assert.equal(failed.ready.value,false);await assert.rejects(failed.simpan(),/belum siap/);
 assert.match(read('views/setting/UserForm.vue'),/<option value="">Semua Pabrik<\/option>/);
});
test('User browse uses API columns, correct action slot and permission-controlled actions',()=>{
 const source=read('views/setting/UserView.vue');assert.match(source,/#row-actions-end=/);assert.doesNotMatch(source,/#default=|JumlahModul|key: "Status"|window.location.reload/);
 for(const key of ['Kode','Nama','Cabang'])assert.ok(source.includes(`key: "${key}"`));
 assert.match(source,/canInsert \? '\/setting\/user\/form'/);assert.match(source,/canEdit \? '\/setting\/user\/form'/);assert.match(source,/v-if="canDelete"/);
 assert.doesNotMatch(source,/key: "(?:Edit|Dibuat)"/);
 assert.match(source,/#row-actions=/);
 assert.match(source,/:action-width="240"/);
 for(const title of ['Reset Password','Hapus User'])assert.ok(source.includes(`title="${title}"`));
 const permission=read('views/setting/HakAksesView.vue');assert.match(permission,/\['Lihat', 'Tambah', 'Ubah', 'Hapus'\]/);assert.match(permission,/:disabled="!canSave"/);
});
