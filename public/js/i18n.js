/* Ludo Party – translations (Arabic first, English optional) */
(function () {
  'use strict';
  var D = {
    ar: {
      botName: 'روبوت {n}', removeBot: 'إزالة', addBot: 'إضافة روبوت', timerLabel: 'مؤقت الدور (ثانية)', timerOff: 'بدون',
      bonusCapture: 'دور إضافي عند الأسر', bonusHome: 'دور إضافي عند الوصول للمركز', hostOnlyRules: 'المضيف فقط يعدّل القواعد',
      autoMove: 'تحريك تلقائي عند وجود خيار واحد', rotateBoard: 'تدوير اللوحة ليكون لونك أسفل اليسار', autoBadge: 'تلقائي',
      'n.autopilot': '{name} تأخر — اللعب تلقائياً', quickChat: 'رسائل سريعة',
      chat0: 'يلا بسرعة!', chat1: 'أحسنت!', chat2: 'حظاً سعيداً', chat3: 'يا للأسف!', chat4: 'كله حسب الخطة', chat5: 'مرة ثانية؟',
      stHome: 'في المركز', stCaps: 'أسر', stSixes: 'ستّات', stGames: 'مباراة', stWins: 'فوز', yourStats: 'إحصائياتك',
      gfxLabel: 'الرسوميات', gfxAuto: 'تلقائي', gfxHigh: 'عالية', gfxMed: 'متوسطة', gfxLow: 'منخفضة', gfx2d: '2D كلاسيكي',
      gfxLowered: 'تم خفض الرسوميات لتحسين الأداء', gfxFallback: 'تعذّر تشغيل 3D على جهازك — تم التحويل إلى 2D', gfxNote2d: 'الوضع الكلاسيكي لا يحتاج كرت رسوميات',
      chatTitle: 'الدردشة', chatPh: 'اكتب رسالة…', chatAll: 'الجميع', chatSend: 'إرسال', chatOpen: 'الدردشة', chatSwitch: 'الدردشة في الغرفة',
      chatPrivacy: 'الرسائل داخل هذه الغرفة فقط ولا تُحفظ بعد إغلاقها', chatEmpty: 'لا رسائل بعد — ابدأ المحادثة!',
      chatWhisperTo: 'رسالة خاصة إلى {name}', chatPrivTo: 'خاص إلى {name}', chatPrivFrom: 'خاص لك', chatOff: 'أوقف المضيف الدردشة في هذه الغرفة',
      chatMuted: 'لاعب مكتوم — اضغط على اسمه لإلغاء الكتم', chatMuteOn: 'تم كتم {name}', chatMuteOff: 'تم إلغاء كتم {name}',
      'err.CHAT_OFF': 'الدردشة متوقفة في هذه الغرفة',
      btnStyle: 'التخصيص', styleTitle: 'تخصيص الشكل', lobbyStyle: 'تخصيص القطع والنرد', tabBoard: 'اللوحة', tabPawn: 'القطع', tabDice: 'النرد',
      styleNo3d: 'المعاينة تحتاج وضع 3D — جهازك سيطبّق الاختيارات عند توفره', styleNote: 'القطع والنرد يراها كل اللاعبين، أما شكل اللوحة فيراه لاعبه فقط',
      groupShape: 'الشكل', groupFinish: 'الخامة', chatFeedToggle: 'إظهار الرسائل على الشاشة أثناء اللعب',
      't.classic': 'كلاسيكي', 't.wood': 'خشبي', 't.neon': 'نيون ليلي', 't.royal': 'ملكي', 't.ocean': 'محيط', 't.desert': 'صحراوي',
      'p.classic': 'بيدق', 'p.crown': 'تاج', 'p.gem': 'جوهرة', 'p.orb': 'كرة', 'p.rook': 'قلعة',
      'f.glossy': 'لامع', 'f.matte': 'مطفي', 'f.gold': 'ذهبي', 'f.chrome': 'كروم', 'f.glass': 'زجاجي', 'f.neon': 'مضيء',
      'd.ivory': 'عاجي', 'd.ruby': 'ياقوتي', 'd.onyx': 'أسود وذهبي', 'd.ice': 'جليدي', 'd.neon': 'نيون', 'd.wood': 'خشبي',
      chat6: 'ضربة معلم!', chat7: 'لا تستعجل', chat8: 'سامحني', chat9: 'أنت قوي!', chat10: 'هذه المرة لي', chat11: 'ثواني وأرجع', phrasesTab: 'عبارات سريعة',
      logo1: 'لودو', logo2: 'بارتي', tagline: 'العب لودو مع أصدقائك أونلاين',
      play: 'العب الآن', create: 'إنشاء غرفة', join: 'انضمام', settings: 'الإعدادات', sound: 'الصوت', help: 'طريقة اللعب',
      nickname: 'اسمك', nickPh: 'اكتب اسمك', chooseAvatar: 'اختر صورتك', back: 'رجوع', close: 'إغلاق',
      createTitle: 'إنشاء غرفة', yourColor: 'لونك', createBtn: 'إنشاء الغرفة',
      joinTitle: 'الانضمام لغرفة', roomCode: 'رمز الغرفة', joinBtn: 'انضم للغرفة', checking: 'جارٍ التحقق…',
      roomOpen: 'الغرفة متاحة — {n}/4 لاعبين', takenColor: 'هذا اللون محجوز',
      lobbyTitle: 'غرفة الانتظار', roomCodeLabel: 'رمز الغرفة', copy: 'نسخ', share: 'مشاركة',
      copied: 'تم نسخ الرمز', linkCopied: 'تم نسخ رابط الدعوة', shareText: 'انضم إلى غرفتي في لودو بارتي! الرمز: {code}',
      changeColor: 'غيّر لونك', leave: 'مغادرة', host: 'المضيف', ready: 'جاهز', waitingSeat: 'بانتظار لاعب…',
      imReady: 'أنا جاهز', cancelReady: 'إلغاء الجاهزية', start: 'ابدأ اللعبة',
      hintHost: 'ابدأ عندما يصبح الجميع جاهزين (لاعبان على الأقل)', hintNeed: 'بانتظار لاعب آخر على الأقل…', hintWaitReady: 'بانتظار جاهزية اللاعبين…',
      hintGuest: 'اضغط «أنا جاهز» وانتظر المضيف', hintGuestReady: 'أنت جاهز — بانتظار المضيف',
      roll: 'ارمِ النرد', rolling: 'يرمي…', yourTurn: 'دورك! ارمِ النرد', pickToken: 'اختر قطعة لتحريكها', turnOf: 'دور {name}',
      noMove: 'لا توجد حركة ممكنة', sixBonus: 'دور إضافي! ارمِ مجدداً', tripleSix: 'ثلاث ستّات — يُلغى الدور', offlineTurn: '{name} غير متصل',
      reactions: 'التفاعلات', gameEnded: 'انتهت اللعبة',
      winTitle: 'الفائز: {name}', youWon: 'مبروك! أنت الفائز 🎉', someoneWon: 'لعبة رائعة!', forfeitWin: 'غادر بقية اللاعبين', playAgain: 'العب مجدداً',
      leaveTitle: 'مغادرة الغرفة؟', leaveText: 'إذا غادرت أثناء اللعب ستخرج من المباراة.', stay: 'البقاء',
      'n.joined': 'انضم {name}', 'n.left': 'غادر {name}', 'n.disc': 'انقطع اتصال {name}', 'n.back': 'عاد {name}',
      netLost: 'انقطع الاتصال… جارٍ إعادة المحاولة', netBack: 'عاد الاتصال', connecting: 'جارٍ الاتصال بالخادم…',
      settingsTitle: 'الإعدادات', language: 'اللغة', sfx: 'المؤثرات الصوتية', music: 'الموسيقى',
      'c.red': 'أحمر', 'c.green': 'أخضر', 'c.yellow': 'أصفر', 'c.blue': 'أزرق',
      'err.ROOM_NOT_FOUND': 'رمز الغرفة غير صحيح', 'err.ROOM_FULL': 'الغرفة ممتلئة', 'err.COLOR_TAKEN': 'هذا اللون محجوز، اختر لوناً آخر',
      'err.GAME_STARTED': 'بدأت اللعبة في هذه الغرفة', 'err.BAD_INPUT': 'بيانات غير صالحة', 'err.NOT_HOST': 'المضيف فقط يستطيع ذلك',
      'err.NOT_READY': 'ليس كل اللاعبين جاهزين', 'err.NEED_PLAYERS': 'تحتاج إلى لاعبين اثنين على الأقل',
      'err.NOT_YOUR_TURN': 'ليس دورك', 'err.ILLEGAL_MOVE': 'حركة غير مسموحة', 'err.BAD_STATE': 'غير متاح الآن',
      'err.RATE': 'مهلاً… ببطء قليلاً', 'err.NO_SESSION': 'انتهت الجلسة', 'err.NOT_IN_ROOM': 'لست في غرفة', 'err.NETWORK': 'تعذر الاتصال بالخادم',
      helpTitle: 'طريقة اللعب',
      h1: 'لكل لاعب 4 قطع. الهدف إيصال القطع الأربع كلها إلى المركز.',
      h2: 'ارمِ النرد في دورك. تحتاج إلى ستّة لإخراج قطعة من القاعدة إلى المسار.',
      h3: 'حرّك أي قطعة بعدد النقاط الظاهر. اضغط على القطعة المضيئة (أو الدائرة المنقطة) لتحريكها.',
      h4: 'تحصل على دور إضافي عند الستّة أو أسر قطعة أو إدخال قطعة المركز (يمكن للمضيف تعديل ذلك). ثلاث ستّات متتالية تُلغي الدور.',
      h5: 'إذا هبطت على قطعة خصم أعدتها إلى قاعدتها، إلا في الخانات الآمنة (خانات البداية والنجوم).',
      h6: 'عند المركز تحتاج إلى الرقم المضبوط تماماً. أول من يُنهي قطعه الأربع يفوز!'
    },
    en: {
      botName: 'Bot {n}', removeBot: 'Remove', addBot: 'Add bot', timerLabel: 'Turn timer (sec)', timerOff: 'Off',
      bonusCapture: 'Extra turn on capture', bonusHome: 'Extra turn on reaching home', hostOnlyRules: 'Only the host can change rules',
      autoMove: 'Auto-move when there is only one choice', rotateBoard: 'Rotate board so your colour is bottom-left', autoBadge: 'AUTO',
      'n.autopilot': '{name} is idle — playing automatically', quickChat: 'Quick chat',
      chat0: 'Hurry up!', chat1: 'Well played!', chat2: 'Good luck!', chat3: 'Oh no!', chat4: 'All going to plan', chat5: 'Rematch?',
      stHome: 'Home', stCaps: 'Captures', stSixes: 'Sixes', stGames: 'games', stWins: 'wins', yourStats: 'Your stats',
      gfxLabel: 'Graphics', gfxAuto: 'Auto', gfxHigh: 'High', gfxMed: 'Medium', gfxLow: 'Low', gfx2d: '2D classic',
      gfxLowered: 'Graphics lowered to keep the game smooth', gfxFallback: '3D is not available on this device — switched to 2D', gfxNote2d: 'Classic mode needs no GPU',
      chatTitle: 'Chat', chatPh: 'Type a message…', chatAll: 'Everyone', chatSend: 'Send', chatOpen: 'Chat', chatSwitch: 'Room chat',
      chatPrivacy: 'Messages stay in this room and are not saved after it closes', chatEmpty: 'No messages yet — say hi!',
      chatWhisperTo: 'Private message to {name}', chatPrivTo: 'private to {name}', chatPrivFrom: 'private to you', chatOff: 'The host turned chat off in this room',
      chatMuted: 'Muted player — tap their name to unmute', chatMuteOn: '{name} muted', chatMuteOff: '{name} unmuted',
      'err.CHAT_OFF': 'Chat is turned off in this room',
      btnStyle: 'Customize', styleTitle: 'Customize look', lobbyStyle: 'Customize pawns & dice', tabBoard: 'Board', tabPawn: 'Pawns', tabDice: 'Dice',
      styleNo3d: '3D preview is not available — your choices apply whenever 3D is on', styleNote: 'Pawns and dice are seen by every player; the board look is yours alone',
      groupShape: 'Shape', groupFinish: 'Finish', chatFeedToggle: 'Show chat messages on screen during the game',
      't.classic': 'Classic', 't.wood': 'Wood', 't.neon': 'Night neon', 't.royal': 'Royal', 't.ocean': 'Ocean', 't.desert': 'Desert',
      'p.classic': 'Pawn', 'p.crown': 'Crown', 'p.gem': 'Gem', 'p.orb': 'Orb', 'p.rook': 'Rook',
      'f.glossy': 'Glossy', 'f.matte': 'Matte', 'f.gold': 'Gold', 'f.chrome': 'Chrome', 'f.glass': 'Glass', 'f.neon': 'Glow',
      'd.ivory': 'Ivory', 'd.ruby': 'Ruby', 'd.onyx': 'Onyx & gold', 'd.ice': 'Ice', 'd.neon': 'Neon', 'd.wood': 'Wood',
      chat6: 'Nice shot!', chat7: 'Take your time', chat8: 'Sorry!', chat9: 'You are good!', chat10: 'My turn to win', chat11: 'Back in a sec', phrasesTab: 'Quick phrases',
      logo1: 'Ludo', logo2: 'Party', tagline: 'Play Ludo online with your friends',
      play: 'Play now', create: 'Create room', join: 'Join', settings: 'Settings', sound: 'Sound', help: 'How to play',
      nickname: 'Your name', nickPh: 'Enter your name', chooseAvatar: 'Choose your avatar', back: 'Back', close: 'Close',
      createTitle: 'Create room', yourColor: 'Your colour', createBtn: 'Create room',
      joinTitle: 'Join a room', roomCode: 'Room code', joinBtn: 'Join room', checking: 'Checking…',
      roomOpen: 'Room found — {n}/4 players', takenColor: 'This colour is taken',
      lobbyTitle: 'Lobby', roomCodeLabel: 'Room code', copy: 'Copy', share: 'Share',
      copied: 'Code copied', linkCopied: 'Invite link copied', shareText: 'Join my room in Ludo Party! Code: {code}',
      changeColor: 'Change your colour', leave: 'Leave', host: 'Host', ready: 'Ready', waitingSeat: 'Waiting for player…',
      imReady: "I'm ready", cancelReady: 'Cancel ready', start: 'Start game',
      hintHost: 'Start when everyone is ready (2 players minimum)', hintNeed: 'Waiting for at least one more player…', hintWaitReady: 'Waiting for players to be ready…',
      hintGuest: 'Tap “I’m ready” and wait for the host', hintGuestReady: "You're ready — waiting for the host",
      roll: 'Roll dice', rolling: 'Rolling…', yourTurn: 'Your turn! Roll the dice', pickToken: 'Pick a token to move', turnOf: "{name}'s turn",
      noMove: 'No possible move', sixBonus: 'Extra turn! Roll again', tripleSix: 'Three sixes — turn forfeited', offlineTurn: '{name} is offline',
      reactions: 'Reactions', gameEnded: 'Game over',
      winTitle: '{name} wins!', youWon: 'Congratulations, you won! 🎉', someoneWon: 'Great game!', forfeitWin: 'The other players left', playAgain: 'Play again',
      leaveTitle: 'Leave the room?', leaveText: 'If you leave during a match you are out of the game.', stay: 'Stay',
      'n.joined': '{name} joined', 'n.left': '{name} left', 'n.disc': '{name} disconnected', 'n.back': '{name} is back',
      netLost: 'Connection lost… retrying', netBack: 'Back online', connecting: 'Connecting to server…',
      settingsTitle: 'Settings', language: 'Language', sfx: 'Sound effects', music: 'Music',
      'c.red': 'Red', 'c.green': 'Green', 'c.yellow': 'Yellow', 'c.blue': 'Blue',
      'err.ROOM_NOT_FOUND': 'Room code not found', 'err.ROOM_FULL': 'The room is full', 'err.COLOR_TAKEN': 'That colour is taken, pick another',
      'err.GAME_STARTED': 'The game in this room has already started', 'err.BAD_INPUT': 'Invalid input', 'err.NOT_HOST': 'Only the host can do that',
      'err.NOT_READY': 'Not all players are ready', 'err.NEED_PLAYERS': 'You need at least two players',
      'err.NOT_YOUR_TURN': "It's not your turn", 'err.ILLEGAL_MOVE': 'Illegal move', 'err.BAD_STATE': 'Not available right now',
      'err.RATE': 'Slow down a little…', 'err.NO_SESSION': 'Session expired', 'err.NOT_IN_ROOM': 'You are not in a room', 'err.NETWORK': 'Could not reach the server',
      helpTitle: 'How to play',
      h1: 'Each player has 4 tokens. Bring all four to the centre to win.',
      h2: 'Roll the dice on your turn. You need a six to bring a token out of its base.',
      h3: 'Move any token by the number shown. Tap a glowing token (or its dotted target) to move it.',
      h4: 'You get an extra turn for a six, a capture or reaching home (the host can change this). Three sixes in a row forfeit the turn.',
      h5: 'Landing on an opponent sends it back to base — except on safe cells (start cells and stars).',
      h6: 'You need the exact number to enter the centre. First to finish all four tokens wins!'
    }
  };
  var lang = 'ar';
  function t(key, params) {
    var s = (D[lang] && D[lang][key]) || D.en[key] || key;
    if (params) Object.keys(params).forEach(function (k) { s = s.split('{' + k + '}').join(params[k]); });
    return s;
  }
  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  }
  function setLang(l) {
    lang = D[l] ? l : 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    apply();
  }
  window.I18N = { t: t, apply: apply, setLang: setLang, get lang() { return lang; } };
})();
