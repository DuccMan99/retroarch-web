var Module = new class{
      noInitialRun = true;
      arguments = ["-v", "--menu"];
      preRun = [];
      postRun = [];
      print = text=>console.log(text);
      printErr = text=>console.log(text);
      canvas = document.querySelector('#canvas');
      totalDependencies =  0;
      onRuntimeInitialized = e=>{
         console.log('Wasm Ready');
      };
      monitorRunDependencies = function(left)
      {
         console.log(FS);
         this.totalDependencies = Math.max(this.totalDependencies, left);
      }
      constructor(){
         document.addEventListener('keydown',e=>{
            e.preventDefault();
            this.canvas.dispatchEvent(this.KeyboardEvent(e));
         });
         document.addEventListener('keyup',e=>{
            e.preventDefault();
            this.canvas.dispatchEvent(this.KeyboardEvent(e));
         });
         let Module = this;
         document.querySelectorAll('[data-dobtn]').forEach(elm=>elm.addEventListener('click',function(e){
            let elm = this,
                btn = elm.getAttribute("data-dobtn");
                if(!elm) return ;
                console.log(elm,btn);
                if(btn == 'hidemenu'){
                  Module.queryElm('nav').hidden = true;
                  Module.queryElm('.showMenu').hidden = false;
                  if(Module.callMain)Module.resize();
                }else if(btn == "showmenu"){
                  Module.queryElm('nav').hidden = false;
                  Module.queryElm('.showMenu').hidden = true;
                  if(Module.callMain)Module.resize();
                }else if(btn == "run"){
                  Module.startCore();
                }else if(btn=="addcontent"){
                  Module.queryElm('#btnRom').click();
                }else if(btn=="clearup"){
                  Module.cleanupStorage();
               }else if(btn=="menutoggle"){
                  Module.showMenu();
               }else if(btn=="Fullscreen"){
                  Module.requestFullscreen(false);
               }

         }));
         this.queryElm('#core-selector').addEventListener('click',e=>{
            let core = e.target.getAttribute("data-core");
            if(core)Module.switchCore(core)&&location.reload();
         });
         this.queryElm("#btnRom").onchange = event=>this.selectFiles(event.target.files[0]);
         let core = localStorage.getItem("core")||"gambatte";
         // Make the core the selected core in the UI.
         let coreElm = this.queryElm(`#core-selector a[data-core="${core}"]`);
         coreElm.classList.add('active');
         this.queryElm(`#dropdownMenu1`).textContent = coreElm.textContent;
      }
      queryElm(str){
         return document.querySelector(str);
      }
      KeyboardEvent(e){
         return new KeyboardEvent(e.type,{
            "code":e.code,
            "key":e.key,
            "location":e.location,
            "ctrlKey":e.ctrlKey,
            "shiftKey":e.shiftKey,
            "altKey":e.altKey,
            "metaKey":e.metaKey,
            "repeat":e.repeat,
            "locale":e.locale,
            "char":e.char,
            "charCode":e.charCode,
            "keyCode":e.keyCode,
            "which":e.which
         });
      }
      async startCore(core){
         core = core||localStorage.getItem("core")||"gambatte";
         // Make the core the selected core in the UI.
         let coreElm = this.queryElm(`#core-selector a[data-core="${core}"]`);
         coreElm.classList.add('active');
         this.queryElm(`#dropdownMenu1`).textContent = coreElm.textContent;
         let retroarchTxt = new TextDecoder().decode(await (await fetch(`${core}_libretro.js`)).arrayBuffer());
         retroarchTxt = retroarchTxt.replace(
            'var __specialEventTargets=[0,typeof document!=="undefined"?document:0,typeof window!=="undefined"?window:0];',
            'var __specialEventTargets=[0,Module.canvas,window];'
         ).replace(
            'var rect=__specialEventTargets.indexOf(target)<0?__getBoundingClientRect(target):{"left":0,"top":0};',
            'var rect= __getBoundingClientRect(Module.canvas);'
         )
         ;
         // Load the Core's related JavaScript.
         let script = document.createElement('script');
         script.src = window.URL.createObjectURL(new Blob([retroarchTxt],{type:'text/javascript'}));
         script.onload = e=>{
            window.URL.revokeObjectURL(script.src);
            this.idbfsInit();
         };
         document.body.appendChild(script);
      }
      idbfsInit(){
         var imfs = new BrowserFS.FileSystem.InMemory();
         if (BrowserFS.FileSystem.IndexedDB.isAvailable()){
            this.afs = new BrowserFS.FileSystem.AsyncMirror(imfs,
               new BrowserFS.FileSystem.IndexedDB((e, fs)=>{
                  if (e){
                     //fallback to imfs
                     this.afs = new BrowserFS.FileSystem.InMemory();
                     console.log("WEBPLAYER: error: " + e + " falling back to in-memory filesystem");
                     this.setupFileSystem("browser");
                     this.preLoadingComplete();
                  }else{
                     // initialize afs by copying files from async storage to sync storage.
                     this.afs.initialize(msg=>
                     {
                        if (msg)
                        {
                           this.afs = new BrowserFS.FileSystem.InMemory();
                           console.log("WEBPLAYER: error: " + msg + " falling back to in-memory filesystem");
                           this.setupFileSystem("browser");
                           this.preLoadingComplete();
                        }
                        else
                        {
                           this.idbfsSyncComplete();
                        }
                     });
                  }
               },
            "RetroArch"
            ));
         }
      }
      setupFileSystem(backend){
         /* create a mountable filesystem that will server as a root
            mountpoint for browserfs */
         var mfs =  new BrowserFS.FileSystem.MountableFileSystem();
         /* create an XmlHttpRequest filesystem for the bundled data */
         var xfs1 =  new BrowserFS.FileSystem.XmlHttpRequest(".index-xhr", "assets/frontend/bundle/");
         /* create an XmlHttpRequest filesystem for core assets */
         var xfs2 =  new BrowserFS.FileSystem.XmlHttpRequest(".index-xhr", "assets/cores/");
         console.log("WEBPLAYER: initializing filesystem: " + backend);
         mfs.mount('/home/web_user/retroarch/userdata', this.afs);
         mfs.mount('/home/web_user/retroarch/bundle', xfs1);
         mfs.mount('/home/web_user/retroarch/userdata/content/downloads', xfs2);
         BrowserFS.initialize(mfs);
         var BFS = new BrowserFS.EmscriptenFS();
         FS.mount(BFS, {root: '/home'}, '/home');
         console.log("WEBPLAYER: " + backend + " filesystem initialization successful");
         setTimeout(()=>this.startRetroArch(),800);
         //this.startRetroArch();

      }
      idbfsSyncComplete(){
         console.log("WEBPLAYER: idbfs setup successful");
         this.setupFileSystem("browser");
      }
      startRetroArch(){
         this.queryElm(`button[data-dobtn="menutoggle"]`).hidden = false;
         this.queryElm(`button[data-dobtn="Fullscreen"]`).hidden = false;
         this.queryElm(`button[data-dobtn="addcontent"]`).hidden = false;
         this.queryElm(`button[data-dobtn="run"]`).remove();
         this.queryElm(`img[data-dobtn="run"]`).remove();
         this.canvas.hidden = false;
         this['callMain'](this['arguments']);
         this.resize();
         window.addEventListener('resize',e=>this.resize());
         if("ontouchstart" in document){
            //mobile
            let txt = new TextDecoder().decode(FS.readFile('/home/web_user/retroarch/userdata/retroarch.cfg'));
            txt.split("\n").forEach(val=>{
               let s = val.split('='),
               key = s[0].replace(/^\s+?/,'').replace(/\s+?$/,''),
               value = s[1]&&s[1].replace(/^\s+?"?/,'').replace(/"?\s*?$/,'');
                  if(this.KeyMap[key]&&value){
                     this.KeyMap[key] = value;
                  }

            })
            this.queryElm('.game-ctrl').hidden = false;
            let ETYPE = ['mousedown', 'mouseup', 'mouseout', 'mousemove'],
            ELM_ATTR = (elm, key)=>{if (elm!=undefined &&elm!=null&& elm.nodeType == 1) return elm.getAttribute(key);},
            stopEvent = (e,bool)=>{if(!bool)e.preventDefault();e.stopPropagation();return false;},
            sendState = (arr)=>{
               if(!this.KeyState){
                 this.KeyState = {};
                  for(let i in this.KeyMap){
                    this.KeyState[i] = 0;
                  }
               }
               for(var i in this.KeyMap){
                  let k = i.replace('input_player1_','');
                  if(arr.includes(k)){
                     this.KeyState[i] = 1;
                     if(this.KeyMap[i])this.keyPress(this.KeyMap[i],'keydown');
                  }else if(this.KeyState[i] == 1){
                    this.KeyState[i] = 0;
                    if(this.KeyMap[i])this.keyPress(this.KeyMap[i],'keyup');
                  }
               }
            };
            if ("ontouchstart" in document) {
              ETYPE = ['touchstart', 'touchmove', 'touchcancel', 'touchend'];
          }
          ETYPE.forEach(val => this.queryElm('.game-ctrl').addEventListener(val, (event) => {
              let ct = event.changedTouches && event.changedTouches[0],
                  cte = ct && document.elementFromPoint(ct.pageX, ct.pageY),
                  elm = cte ||event.target,
                  keyState = [],
                  type = event.type,
                  key = ELM_ATTR(elm, 'data-k'),
                  btn = ELM_ATTR(elm, 'data-btn');
              if (btn) {
                  if (["mouseup", "touchend"].includes(type)) {
                      if (type != "touchend" || elm == event.target) {
                          btn = btn.toLowerCase();
                          if(this.btnMap[btn]) this.btnMap[btn](event);
                      }
                  }
                  return stopEvent(event,1);
              } else if (key) {
                  if (event.touches && event.touches.length > 0) {
                      for (var i = 0; i < event.touches.length; i++) {
                          var t = event.touches[i];
                          var k = ELM_ATTR(document.elementFromPoint(t.pageX, t.pageY), 'data-k');
                          if (k) {
                             if(k=='ul')keyState = keyState.concat(['up','left']);
                             else if(k=='ur')keyState = keyState.concat(['down','right']);
                             else if(k=='dl')keyState = keyState.concat(['up','left']);
                             else if(k=='dr')keyState = keyState.concat(['down','right']);
                             else keyState.push(k);
                          }
                      }
                      stopEvent(event);
                  } else {
                      if (type == "mouseup") {
                          this.mousedownHold = false;
                      } else if (type == 'mousedown') {
                          this.mousedownHold = true;
                          sendState([key]);
                          return stopEvent(event);
                      }
                  }
              }
              sendState(keyState);
          }, {
              'passive': false
          }));
         }
         console.log(this.queryElm('nav').getBoundingClientRect())
         //this.queryElm("#canvas").focus();
      }
      resize(){
         let nav = this.queryElm('nav').getBoundingClientRect(),o = Number(window.orientation);
         if(o==0||o==180){

         }
         this.setCanvasSize(Math.min(window.innerWidth,document.documentElement.clientWidth),Math.min(window.innerHeight,document.documentElement.clientHeight) - nav.height);
      }
      cleanupStorage(){
         localStorage.clear();
         if (BrowserFS.FileSystem.IndexedDB.isAvailable())
         {
            var req = indexedDB.deleteDatabase("RetroArch");
            req.onsuccess = function () {
               console.log("Deleted database successfully");
            };
            req.onerror = function () {
               console.log("Couldn't delete database");
            };
            req.onblocked = function () {
               console.log("Couldn't delete database due to the operation being blocked");
            };
         }
         this.queryElm("#btnClean").disabled = true;
      }
      keyPress(key,type){
         let m = this.keyToCode[key.toLowerCase()];
         console.log(m);
         this.canvas.dispatchEvent(new KeyboardEvent(type, {'code':m||key,'key':key}));
      }
      showMenu(){
         this.keyPress('F1','keydown');
         setTimeout(e=>this.keyPress('F1','keyup'),50);
      }
      selectFiles(files){
         let filereader = new FileReader();
         filereader.file_name = files.name;
         filereader.readAsArrayBuffer(files);
         filereader.onload = e=>{this.uploadData(new Uint8Array(e.target.result), files.name);console.log(e);}
      }
      uploadData(data,name){
         //FS.createDataFile('/', name, data, true, false);
         //var data = FS.readFile(name,{ encoding: 'binary' });
         FS.writeFile('/home/web_user/retroarch/userdata/content/' + name, data ,{ encoding: 'binary' });
         //FS.unlink(name);
         this.showMenu();
      }
      switchCore(corename){
         corename = corename||'gambatte'
         localStorage.setItem("core", corename);
         if(this._main) return true;
         else this.startCore(corename);
      }
      KeyMap = {
         //input_player1_a
        input_player1_a:"x",
        input_player1_b:"z",
        input_player1_down:"down",
        input_player1_l:"q",
        input_player1_l2:"nul",
        input_player1_l3:"nul",
        input_player1_left:"left",
        input_player1_r:"w",
        input_player1_r2:"nul",
        input_player1_r3:"nul",
        input_player1_right:"right",
        input_player1_select:"rshift",
        input_player1_start:"enter",
        input_player1_turbo:"nul",
        input_player1_up:"up",
        input_player1_x:"s",
        input_player1_y:"a",
        input_toggle_fast_forward:"space",
        input_reset:"h",
      };
      keyToCode = {
           "tilde":"Backquote",
           "num1":"Digit1",
           "num2":"Digit2",
           "num3":"Digit3",
           "num4":"Digit4",
           "num5":"Digit5",
           "num6":"Digit6",
           "num7":"Digit7",
           "num8":"Digit8",
           "num9":"Digit9",
           "num0":"Digit0",
           "minus":"Minus",
           "equal":"Equal",
           "backspace":"Backspace",
           "tab":"Tab",
           "q":"KeyQ",
           "w":"KeyW",
           "e":"KeyE",
           "r":"KeyR",
           "t":"KeyT",
           "y":"KeyY",
           "u":"KeyU",
           "i":"KeyI",
           "o":"KeyO",
           "p":"KeyP",
           "a":"KeyA",
           "s":"KeyS",
           "d":"KeyD",
           "f":"KeyF",
           "g":"KeyG",
           "h":"KeyH",
           "j":"KeyJ",
           "k":"KeyK",
           "l":"KeyL",
           "z":"KeyZ",
           "x":"KeyX",
           "c":"KeyC",
           "v":"KeyV",
           "b":"KeyB",
           "n":"KeyN",
           "m":"KeyM",
           "leftbracket":"BracketLeft",
           "rightbracket":"BracketRight",
           "backslash":"Backslash",
           "capslock":"CapsLock",
           "semicolon":"Semicolon",
           "quote":"Quote",
           "enter":"Enter",
           "shift":"ShiftLeft",
           "comma":"Comma",
           "period":"Period",
           "slash":"Slash",
           "rshift":"ShiftRight",
           "ctrl":"ControlLeft",
           "lmeta":"MetaLeft",
           "alt":"AltLeft",
           "space":"Space",
           "ralt":"AltRight",
           "menu":"ContextMenu",
           "rctrl":"ControlRight",
           "up":"ArrowUp",
           "left":"ArrowLeft",
           "down":"ArrowDown",
           "right":"ArrowRight",
           "kp_period":"NumpadDecimal",
           "kp_enter":"NumpadEnter",
           "keypad0":"Numpad0",
           "keypad1":"Numpad1",
           "keypad2":"Numpad2",
           "keypad3":"Numpad3",
           "keypad4":"Numpad4",
           "keypad5":"Numpad5",
           "keypad6":"Numpad6",
           "keypad7":"Numpad7",
           "keypad8":"Numpad8",
           "keypad9":"Numpad9",
           "add":"NumpadAdd",
           "numlock":"NumLock",
           "divide":"NumpadDivide",
           "multiply":"NumpadMultiply",
           "subtract":"NumpadSubtract",
           "home":"Home",
           "end":"End",
           "pageup":"PageUp",
           "pagedown":"PageDown",
           "del":"Delete",
           "insert":"Insert",
           "f12":"F12",
           "f10":"F10",
           "f9":"F9",
           "f8":"F8",
           "f7":"F7",
           "f6":"F6",
           "f5":"F5",
           "f4":"F4",
           "f3":"F3",
           "f2":"F2",
           "f1":"F1",
           "escape":"Escape"
      };
    };
