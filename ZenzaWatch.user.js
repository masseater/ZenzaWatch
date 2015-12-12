// ==UserScript==
// @name           ZenzaWatch
// @namespace      https://github.com/segabito/
// @description    Ginzaに行かなくても動画を再生
// @match          http://www.nicovideo.jp/*
// @match          http://ext.nicovideo.jp/*
// @grant          none
// @author         segabito macmoto
// @version        0.1.16
// @require        https://cdnjs.cloudflare.com/ajax/libs/lodash.js/3.10.1/lodash.js
// ==/UserScript==

(function() {

var monkey = function() {
  var console = window.console;
  console.log('exec ZenzaWatch..');
    var $ = window.jQuery, _ = window._;

    var ZenzaWatch = {
      debug: {},
      util: {
        hereDoc: function(func) { // えせヒアドキュメント
          return func.toString().match(/[^]*\/\*([^]*)\*\/\}$/)[1].replace(/\{\*/g, '/*').replace(/\*\}/g, '*/');
        }
      }
    };

    window.ZenzaWatch = ZenzaWatch;


    var AsyncEmitter = (function() {

      function AsyncEmitter() {
        this._events = {};
      }

      AsyncEmitter.prototype.on = function(name, callback) {
        name = name.toLowerCase();
        if (!this._events[name]) {
          this._events[name] = [];
        }
        this._events[name].push(callback);
      };

      AsyncEmitter.prototype.off = function(name, func) {
        if (!func) {
          this._events[name] = [];
          return;
        }

        if (!this._events[name]) {
          this._events[name] = [];
        }
        _.pull(this._events[name], func);
      }

      AsyncEmitter.prototype.clear = function(name) {
        if (name) {
          this._events[name] = [];
        } else {
          this._events = {};
        }
      };

      AsyncEmitter.prototype.emit = function(name) {
        name = name.toLowerCase();
        if (!this._events.hasOwnProperty(name)) { return; }
        var e = this._events[name];
        for (var i =0, len = e.length; i < len; i++) {
          try {
            e[i].apply(null, Array.prototype.slice.call(arguments, 1));
          } catch (ex) {
            console.log('%c' + name, 'background:red; color: white;', i, e[i], ex);
            throw ex;
          }
        }
      };

      AsyncEmitter.prototype.emitAsync = function() {
        var args = arguments;

        window.setTimeout($.proxy(function() {
          try {
            this.emit.apply(this, args);
          } catch (e) {
            console.log(e);
            throw e;
          }
        }, this), 0);
      };

      return AsyncEmitter;
    })();

    ZenzaWatch.emitter = new AsyncEmitter();

    var FullScreen = {
      now: function() {
        if (document.fullScreenElement || document.mozFullScreen || document.webkitIsFullScreen) {
          return true;
        }
        return false;
      },
      request: function(target) {
        this._handleEvents();
        var elm = typeof target === 'string' ? document.getElementById(target) : target;
        if (!elm) { return; }
        if (elm.requestFullScreen) {
          elm.requestFullScreen();
        } else if (elm.webkitRequestFullScreen) {
          elm.webkitRequestFullScreen();
        } else if (elm.mozRequestFullScreen) {
          elm.mozRequestFullScreen();
        }
        //$('body').addClass('fullScreen');
      },
      cancel: function() {
        if (!this.now()) { return; }

        if (document.cancelFullScreen) {
          document.cancelFullScreen();
        } else if (document.webkitCancelFullScreen) {
          document.webkitCancelFullScreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        }
        //$('body').removeClass('fullScreen');
      },
      _handleEvents: function() {
        this._handleEvnets = _.noop;
        var self = this;
        var handle = function() {
          var isFullScreen = self.now();
          if (isFullScreen) {
            $('body').addClass('fullScreen');
          } else {
            $('body').removeClass('fullScreen');
          }
          ZenzaWatch.emitter.emit('fullScreenStatusChange', isFullScreen);
        };
        document.addEventListener("webkitfullscreenchange", handle, false);
        document.addEventListener("mozfullscreenchange", handle, false);
        document.addEventListener("MSFullscreenChange", handle, false);
        document.addEventListener("fullscreenchange", handle, false);
      }
    };

    ZenzaWatch.util.fullScreen = FullScreen;

    var Config = (function() {
      var prefix = 'ZenzaWatch_';
      var emitter = new AsyncEmitter();

      // 直接変更する時はコンソールで
      // ZenzaWatch.config.setValue('hogehoge' fugafuga);
      var defaultConfig = {
        debug: false,
        volume:       0.1,
        forceEnable:  false,
        showComment:  true,
        autoPlay:     true,
        loop:         false,
        mute:         false,
        screenMode:   'normal',
        playbackRate: 1.0
      };
      var config = {};

      for (var key in defaultConfig) {
        var storageKey = prefix + key;
        if (localStorage.hasOwnProperty(storageKey)) {
          try {
            config[key] = JSON.parse(localStorage[storageKey]);
          } catch (e) {
            console.error('config parse error: ', e);
            config[key] = defaultConfig[key];
          }
        } else {
          config[key] = defaultConfig[key];
        }
      }

      emitter.getValue = function(key) {
        return config[key];
      };

      emitter.setValue = function(key, value) {
        if (config[key] !== value) {
          var storageKey = prefix + key;
          localStorage[storageKey] = JSON.stringify(value);
          config[key] = value;

          console.log('%cconfig update "%s" = "%s"', 'background: cyan', key, value);
          this.emitAsync('update', key, value);
          this.emitAsync('update-' + key, value);
        }
      };

      return emitter;
    })();

    ZenzaWatch.config = Config;

    var dummyConsole = {
      log: _.noop, error: _.noop, time: _.noop, timeEnd: _.noop, trace: _.noop
    };
    var console = Config.getValue('debug') ? window.console : dummyConsole;
    Config.on('update-debug', function(v) {
      console = v ? window.console : dummyConsole;
    });

    var PopupMessage = (function() {
      var __view__ = ZenzaWatch.util.hereDoc(function() {/*
        <div class="zenzaPopupMessage">
          <span>%MSG%</span>
        </div>
      */});

      var __css__ = ZenzaWatch.util.hereDoc(function() {/*
        .zenzaPopupMessage {
          position: fixed;
          top: -50px;
          left: 10px;
          z-index: 200000;
          opacity: 0;
          white-space: nowrap;
          font-weight: bolder;
          padding: 8px 16px;
          transition:
            top 2s linear,
            opacity 3s ease,
            z-index 1s ease,
            box-shadow 1s ease,
            background 5s ease;
          pointer-events: none;
          background: #000;
        }

        .zenzaPopupMessage.show {
          z-index: 250000;
          top: 50px;
          opacity: 0.8;
          box-shadow: 4px 4px 2px #ccc;
          transition:
            top 0.5s linear,
            opacity 1s ease,
            z-index 1s ease,
            box-shadow 0.5s ease,
            background 0.5s ease;
         }

        .zenzaPopupMessage.notify.show {
          background: #0c0;
          color: #fff;
        }

        .zenzaPopupMessage.alert.show {
          background: #c00;
          color: #fff;
        }

      */});

      var initialize = function() {
        initialize = _.noop;
        addStyle(__css__);
      };

      var show = function($msg) {
        initialize();
        $('body').append($msg);
        window.setTimeout(function() { $msg.addClass('show'); }, 100);
        window.setTimeout(function() { $msg.removeClass('show'); }, 3000);
        window.setTimeout(function() { $msg.remove(); }, 10000);
      };

      var notify = function(msg) {
        console.log('%c%s', 'background: #080; color: #fff; padding: 8px;', msg);
        var $msg = $(__view__.replace('%MSG%', msg)).addClass('notify');
        show($msg);
      };

      var alert = function(msg) {
        console.log('%c%s', 'background: #800; color: #fff; padding: 8px;', msg);
        var $msg = $(__view__.replace('%MSG%', msg)).addClass('alert');
        show($msg);
      };

      return {
        notify: notify,
        alert: alert
      };
    })();

    var addStyle = function(styles, id) {
      var elm = document.createElement('style');
      window.setTimeout(function() {
        elm.type = 'text/css';
        if (id) { elm.id = id; }

        var text = styles.toString();
        text = document.createTextNode(text);
        elm.appendChild(text);
        var head = document.getElementsByTagName('head');
        head = head[0];
        head.appendChild(elm);
      }, 0);
      return elm;
    };

    ZenzaWatch.util.addStyle = addStyle;

    var parseQuery = function(query) {
      var result = {};
      query.split('&').forEach(function(item) {
        var sp = item.split('=');
        var key = sp[0];
        var val = decodeURIComponent(sp.slice(1).join('='));
        result[key] = val;
      });
      return result;
    };

    ZenzaWatch.util.parseQuery = parseQuery;

    var hasLargeThumbnail = function(videoId) { // return true;
      // 大サムネが存在する最初の動画ID。 ソースはちゆ12歳
      // ※この数字以降でもごく稀に例外はある。
      var threthold = 16371888;
      var cid = videoId.substr(0, 2);
      if (cid !== 'sm') { return false; }

      var fid = videoId.substr(2) * 1;
      if (fid < threthold) { return false; }

      return true;
    };

    ZenzaWatch.util.hasLargeThumbnail = hasLargeThumbnail;


    var __css__ = ZenzaWatch.util.hereDoc(function() {/*
      .xDomainLoaderFrame {
        border: 0;
        position: fixed;
        top: -999px;
        left: -999px;
        width: 1px;
        height: 1px;
        border: 0;
      }

      .zenzaWatchHoverMenu {
        display: none;
        opacity: 0.8;
        position: absolute;
        background: #eee;
        z-index: 200000;
        cursor: pointer;
        border: outset 1px;
        font-size: 8pt;
        width: 32px;
        height: 26px;
        padding: 0;
        line-height: 26px;
        font-weight: bold;
        text-align: center;
        transition: box-shadow 0.2s ease, opacity 0.4s ease, padding 0.2s ease;
        box-shadow: 2px 2px 3px #000;
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
      }
      .zenzaWatchHoverMenu:hover {
        box-shadow: 4px 4px 5px #000;
        font-weibht: bolder;
        opacity: 1;
      }

      .zenzaWatchHoverMenu.show {
        display: block;
      }

    */});
    // 非ログイン状態のwatchページ用
    var __no_login_watch_css__ = ZenzaWatch.util.hereDoc(function() {/*
      body .logout-video-thumb-box {
        width: 672px;
        height: 386px;
        margin-left: -6px;
      }

      .commentLayerFrame {
        position: absolute;
        top: 0;
        left: 0;
        width: 672px;
        height: 386px;
        z-index: 10000;
        border: 0;
        transition: opacity 1s ease, top 0.4s ease;
        pointer-events: none;

        transform: translateZ(0);
      }

      .logout-video-thumb-box:hover .commentLayerFrame {
        top: -50px;
      }

      .login-box {
        z-index: 10001;
        opacity: 0 !important;
        background-color: rgba(255, 255, 255, 0.8) !important;
        transition: opacity 1s ease;
      }

      .login-box:hover {
        opacity: 1 !important;
        transition: opacity 0.3s ease;
      }

      .videoPlayer {
        position: fixed;
        right: 100px;
        bottom: calc(50% - 100px);
        width: 320px;
        height: 200px;
      }

      .logout-video-thumb-box .videoPlayer {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        right: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }

    */});


    var windowMessageEmitter = (function() {
      var asyncEmitter = new AsyncEmitter();

        var onMessage = function(event) {
          if (event.origin.indexOf('nicovideo.jp') < 0) return;
          if (event.origin === 'http://ads.nicovideo.jp') return;
          try {
            var data = JSON.parse(event.data);
            if (data.id !== 'NicoCommentLayer') { return; }

            asyncEmitter.emit('onMessage', data.body, data.type);
          } catch (e) {
            console.log(
              '%cNicoCommentLayer.Error: window.onMessage  - ',
              'color: red; background: yellow',
              e,
              event
            );
            console.log('%corigin: ', 'background: yellow;', event.origin);
            console.log('%cdata: ',   'background: yellow;', event.data);
            console.trace();
          }
        };

        window.addEventListener('message', onMessage);

      return asyncEmitter;
    })();

    var getWatchId = function(url) {
      /\/?watch\/([a-z0-9]+)/.test(url || location.pathname);
      return RegExp.$1;
    };
    ZenzaWatch.util.getWatchId = getWatchId;

    var isPremium = function() {
      var h = document.getElementById('siteHeaderNotification');
      return h && h.className === 'siteHeaderPremium';
    };
    ZenzaWatch.util.isPremium = isPremium;

    var isLogin = function() {
      return document.getElementsByClassName('siteHeaderLogin').length < 1;
    };
    ZenzaWatch.util.isLogin = isLogin;

    var isSameOrigin = function() {
      return location.host === 'www.nicovideo.jp';
    };
    ZenzaWatch.util.isSameOrigin = isSameOrigin;

    var hasFlashPlayer = function() {
      return !!navigator.mimeTypes['application/x-shockwave-flash'];
    };
    ZenzaWatch.util.hasFlashPlayer = hasFlashPlayer;


    var VideoInfoLoader = (function() {
      var BASE_URL = 'http://ext.nicovideo.jp/thumb_watch';
      var loaderFrame, loaderWindow;
      var videoInfoLoader = new AsyncEmitter();

      var onMessage = function(data, type) {
        if (type !== 'videoInfoLoader') { return; }
        console.log('VideoInfoLoader.onMessage', data, type);
        var info = data.message;

        //console.log('%cvideoInfoLoader.onThumbWatchInfoLoad', 'background: lightgreen;', info);
        videoInfoLoader.emitAsync('load', info, 'THUMB_WATCH');
      };

      // jsの壁を越えてクロス†ドメイン通信するための 異世界の"門"(ゲート) を広げる
      // ログインなしで動画を視聴出来る禁呪を発動させるための魔方陣であるが、現在は封印されている。
      // "フォース" の力によって封印を解いた者だけが異世界の"門"をうんたらかんたら
      //
      // やってることはiframeごしに外部サイト用動画プレイヤーのAPIを叩いてるだけ
      // 原理的には、http://〜のサイトならどこでもZenzaWatchを起動できる。
      var initializeCrossDomainGate = function() {
        initializeCrossDomainGate = _.noop;

        console.log('%c initialize videoInfoLoader', 'background: lightgreen;');

        loaderFrame = document.createElement('iframe');
        loaderFrame.name  = 'videoInfoLoaderLoader';
        loaderFrame.className = 'xDomainLoaderFrame thumb';
        document.body.appendChild(loaderFrame);

        loaderWindow = loaderFrame.contentWindow;

        windowMessageEmitter.on('onMessage', onMessage);
      };

      var loadFromThumbWatch = function(watchId) {
        initializeCrossDomainGate();
        //http://ext.nicovideo.jp/thumb_watch/sm9?cb=onPlayerLoaded&eb=onPlayerError
        var url = [
          BASE_URL, '/',
          watchId,
          '?cb=onPlayerLoaded&eb=onPlayerError'].join('');

        console.log('getVideoInfo: ', url);

        loaderWindow.location.replace(url);
      };

      var parseWatchApiData = function(dom) {
        var $dom = $('<div>' + dom + '</div>');
        try {
          var watchApiData = JSON.parse($dom.find('#watchAPIDataContainer').text());
          var videoId = watchApiData.videoDetail.id;
          var hasLargeThumbnail = ZenzaWatch.util.hasLargeThumbnail(videoId);
          var flvInfo = ZenzaWatch.util.parseQuery(
              decodeURIComponent(watchApiData.flashvars.flvInfo)
            );
          var thumbnail =
            watchApiData.flashvars.thumbImage +
              (hasLargeThumbnail ? '.L' : '');
          var videoUrl = flvInfo.url;
          var isEco = /\d+\.\d+low$/.test(videoUrl);
          var isFlv = /\/smile\?v=/.test(videoUrl);
          var isMp4 = /\/smile\?m=/.test(videoUrl);
          var isSwf = /\/smile\?s=/.test(videoUrl);
          
          var playlist = JSON.parse($dom.find('#playlistDataContainer').text());
          var isPlayable = isMp4 && !isSwf && (videoUrl.indexOf('http') === 0);

          var result = {
            watchApiData: watchApiData,
            flvInfo: flvInfo,
            playlist: playlist,
            isPlayable: isPlayable,
            isMp4: isMp4,
            isFlv: isFlv,
            isSwf: isSwf,
            isEco: isEco,
            thumbnail: thumbnail
          };
          return result;

        } catch (e) {
          console.error('error: parseWatchApiData ', e);
          return null;
        }
      };

      var loadFromWatchApiData = function(watchId) {
        var url = '/watch/' + watchId;
        console.log('%cloadFromWatchApiData...', 'background: lightgreen;', watchId, url);

        var isFallback = false;
        var onLoad = function(req) {
          var data = parseWatchApiData(req);
          ZenzaWatch.debug.watchApiData = data;

          if (!data) {
            PopupMessage.alert('動画情報の取得に失敗(watchApi)');
            return;
          }

          if (data.isFlv && !isFallback) {
            isFallback = true;

            url = url + '?eco=1';
            console.log('%cエコノミーにフォールバック(flv)', 'background: cyan; color: red;', url);
            window.setTimeout(function() {
              $.ajax({
                url: url,
                xhrFields: { withCredentials: true }
              }).then(
                onLoad,
                function() { PopupMessage.alert('動画情報の取得に失敗(watchApi)'); }
              );
            }, 1000);
          } else if (!data.isPlayable) {
            PopupMessage.alert('この動画は再生できません');
          } else if (data.isMp4) {
            videoInfoLoader.emitAsync('load', data, 'WATCH_API');
            ZenzaWatch.emitter.emitAsync('loadVideoInfo', data, 'WATCH_API'); // 外部連携用
          } else {
            PopupMessage.alert('この動画は再生できません');
          }
        };

        $.ajax({
          url: url,
          xhrFields: { withCredentials: true }
        }).then(
          onLoad,
          function() { PopupMessage.alert('動画情報の取得に失敗(watchApi)'); }
        );
      };

      var load = function(watchId) {
        if (isLogin() && isSameOrigin()) {
          loadFromWatchApiData(watchId);
        } else {
          loadFromThumbWatch(watchId);
        }
      };

      _.assign(videoInfoLoader, {
        load: load
      });

      return videoInfoLoader;
    })();

    var CommentLoader = (function() {
      var commentLoader = new AsyncEmitter();

      var initialize = function() {
        initialize = _.noop;
        console.log('%c initialize CommentLoader', 'background: lightgreen;');
      };

      /**
       * 動画の長さに応じて取得するコメント数を変える
       * 本家よりちょっと盛ってる
       */
      var getRequestCountByDuration = function(duration) {
        if (duration < 60) { return 200;}
        if (duration < 300) { return 500;}
        return 1000;
      };

      var getThreadKey = function(threadId) {
        // memo:
        // http://flapi.nicovideo.jp/api/getthreadkey?thread={optionalじゃないほうのID}
        var url =
          'http://flapi.nicovideo.jp/api/getthreadkey?thread=' + threadId +
          '&language_id=0';

        return $.ajax({
          url: url,
          contentType: 'text/plain',
          crossDomain: true,
          cache: false,
          xhrFields: {
            withCredentials: true
          }
        }).then(function(e) {
          return ZenzaWatch.util.parseQuery(e);
        }, function() {
          PopupMessage.alert('ThreadKeyの取得失敗 ' + threadId);
        });
      };

      var version_old = '20061206'
      var version = '20090904'; // '20061206'

      var buildPacket =
        function(threadId, duration, userId, threadKey, force184, optionalThreadId)
      {
        var resCount = getRequestCountByDuration(duration);
        var threadLeavesParam = '0-' + (Math.floor(duration / 60) + 1) + ':100,' + resCount;
        
        var createThreadXml =
          function(threadId, version, userId, threadKey, force184)
        {
          var thread = document.createElement('thread');
          thread.setAttribute('thread', threadId);
          thread.setAttribute('version', version);
          if (typeof userId !== 'undefined') {
            thread.setAttribute('user_id', userId);
          }
          if (typeof threadKey !== 'undefined') {
            thread.setAttribute('threadkey', threadKey);
          }
          if (typeof force184 !== 'undefined') {
            thread.setAttribute('force_184', force184);
          }
          thread.setAttribute('scores', '1');
          thread.setAttribute('nicoru', '1');
          thread.setAttribute('with_global', '1');

          return thread;
        };

        var createThreadLeavesXml =
          function(threadId, version, userId, threadKey, force184)
        {

          var thread_leaves = document.createElement('thread_leaves');
          thread_leaves.setAttribute('thread', threadId);
          if (typeof userId !== 'undefined') {
            thread_leaves.setAttribute('user_id', userId);
          }
          if (typeof threadKey !== 'undefined') {
            thread_leaves.setAttribute('threadkey', threadKey);
          }
          if (typeof force184 !== 'undefined') {
            thread_leaves.setAttribute('force_184', force184);
          }
          thread_leaves.setAttribute('scores', '1');
          thread_leaves.setAttribute('nicoru', '1');

          thread_leaves.innerText = threadLeavesParam;

          return thread_leaves;
        };
        var span = document.createElement('span');
        var packet = document.createElement('packet');

        if (typeof optionalThreadId !== 'undefined') {
          packet.appendChild(
            createThreadXml(optionalThreadId, version, userId, threadKey, force184)
          );
          packet.appendChild(
            createThreadLeavesXml(optionalThreadId, version, userId, threadKey, force184)
          );
        }

        packet.appendChild(
          createThreadXml(threadId, version_old, userId, threadKey, force184)
        );
        // TODO: thread_leavesを使えるようにする。
//        packet.appendChild(
//          createThreadLeavesXml(threadId, version, userId, threadKey, force184)
//        );

        span.appendChild(packet);
        var packetXml = span.innerHTML;

//      packetXml =
//          '<thread res_from="-' + resCount +
//          '" version="20061206"  thread="'+ threadId+'" />';

        return packetXml;
      };

      var onComplete = function(result) {
        if (result.status !== 200) {
          PopupMessage.alert('コメントの取得失敗 ');
          return;
        }
        ZenzaWatch.debug.lastMsgApiResult = result;
        PopupMessage.notify('コメントの取得成功');
        commentLoader.emitAsync('load', result.responseText);
      };

      var post = function(server, xml) {
        var isNmsg = server.indexOf('nmsg.nicovideo.jp') >= 0;
       $.ajax({
          url: server,
          data: xml,
          type: 'POST',
          contentType: isNmsg ? 'text/xml' : 'text/plain',
          dataType: 'xml',
//          xhrFields: { withCredentials: true },
          crossDomain: true,
          cache: false,
          complete: onComplete
        });
      };

      var get = function(server, thread, duration, threadKey, force184) {
        // nmsg.nicovideo.jpでググったら出てきた。
        // http://favstar.fm/users/koizuka/status/23032783744012288
        // xmlじゃなくてもいいのかよ!

        var resCount = getRequestCountByDuration(duration);

        var url = server +
          'thread?version=' + version +
          '&thread=' + thread +
          '&res_from=-' + resCount;
        if (threadKey) {
          url += '&threadkey=' + threadKey;
        }
        if (force184) {
          url += '&force_184=' + force184;
        }

        console.log('%cthread url:', 'background: cyan;', url);
        $.ajax({
          url: url,
          crossDomain: true,
          cache: false,
          complete: onComplete
        });
       };

      var load = function(server, threadId, duration, userId, isNeedKey, optionalThreadId) {
        initialize();
        var packet;
        
        if (isNeedKey) {
          getThreadKey(threadId).then(function(info) {
            console.log('threadkey: ', info);
            packet = buildPacket(
              threadId, duration, userId, info.threadkey, info.force_184);//, optionalThreadId);
            console.log('post xml...', server, packet);
            //get(server, threadId, duration, info.threadkey, info.force_184);
            post(server, packet);
          });
        } else {
          var isNmsg = server.indexOf('nmsg.nicovideo.jp') >= 0;
          if (isNmsg) {
            get(server, threadId, duration);
          } else {
            // nmsgもできればこっちでやりたい。 うまく取れないので調査中。
            packet = buildPacket(
                threadId, duration, userId);
            console.log('post xml...', server, packet);
            post(server, packet);
          }
        }
      };


      _.assign(commentLoader, {
        load: load
      });

      return commentLoader;
    })();



    var ShortcutKeyEmitter = (function() {
      var emitter = new AsyncEmitter();

      var initialize = function() {
        initialize = _.noop;
        $('body').on('keydown.zenzaWatch', onKeyDown);
      };

      var onKeyDown = function(e) {
        if (e.target.tagName === 'SELECT' ||
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA') {
          return;
        }
        var target = e.target;
        var key = '';
        switch (e.keyCode) {
          case 178:
          case 179:
            key = 'PAUSE';
            break;
          case 177:
            key = 'PREV';
            break;
          case 176:
            key = 'NEXT';
            break;
          case 27:
            key = 'ESC';
            break;
          case 70: // F
            key = 'FULL';
            break;
          case 86: // V
            key = 'VIEW_COMMENT';
            break;
          case 32:
            key = 'SPACE';
            break;
          default:
            //console.log('%conKeyDown: %s', 'background: yellow;', e.keyCode);
            break;
        }
        if (key) {
          emitter.emit('keyDown', key, target);
        }
      };

      initialize();
      return emitter;
    })(Config);
  ZenzaWatch.util.ShortcutKeyEmitter = ShortcutKeyEmitter;
  
  
  
  
  
//==================================================
//==================================================
//==================================================
  /**
   * VideoPlayer + CommentPlayer = NicoVideoPlayer
   *
   * とはいえmasterはVideoPlayerでCommentPlayerは表示位置を受け取るのみ。
   *
   */
  var NicoVideoPlayer = function() { this.initialize.apply(this, arguments); };
  _.assign(NicoVideoPlayer.prototype, {
    initialize: function(params) {
      var conf = this._playerConfig = params.playerConfig;

      this._fullScreenNode = params.fullScreenNode;

      this._videoPlayer = new VideoPlayer({
        volume:       conf.getValue('volume'),
        loop:         conf.getValue('loop'),
        mute:         conf.getValue('mute'),
        autoPlay:     conf.getValue('autoPlay'),
        playbackRate: conf.getValue('playbackRate'),
        debug:        conf.getValue('debug')
      });

      this._commentPlayer = new NicoCommentPlayer({
        offScreenLayer: params.offScreenLayer,
        showComment:    conf.getValue('showComment'),
        debug:          conf.getValue('debug'),
        playbackRate:   conf.getValue('playbackRate')
      });

      this._controlPanel = new VideoControlPanel({
        player: this,
        panelNode: params.panelNode,
        playerConfig: conf
      });

      this._contextMenu = new VideoContextMenu({
        player: this,
        playerConfig: conf
      });

      if (params.node) {
        this.appendTo(params.node);
      }

      this._initializeEvents();

      this._beginTimer();

      ZenzaWatch.debug.nicoVideoPlayer = this;
    },
    _beginTimer: function() {
      this._stopTimer();
      this._videoWatchTimer =
        window.setInterval(
          $.proxy(this._onTimer, this), 100);
    },
    _stopTimer: function() {
      if (!this._videoWatchTimer) { return; }
      window.clearInterval(this._videoWatchTimer);
      this._videoWatchTimer = null;
    },
    _initializeEvents: function() {
      this._videoPlayer.on('volumeChange', $.proxy(this._onVolumeChange, this));
      this._videoPlayer.on('dblclick', $.proxy(this.toggleFullScreen, this));
      this._videoPlayer.on('aspectRatioFix', $.proxy(this._onAspectRatioFix, this));
      this._videoPlayer.on('play',  $.proxy(this._onPlay, this));
      this._videoPlayer.on('pause', $.proxy(this._onPause, this));
      this._videoPlayer.on('ended', $.proxy(this._onEnded, this));

      // マウスホイールとトラックパッドで感度が違うのでthrottoleをかますと丁度良くなる(?)
      this._videoPlayer.on('mouseWheel',
        _.throttle($.proxy(this._onMouseWheel, this), 50));

      this._videoPlayer.on('abort', $.proxy(this._onAbort, this));
      this._videoPlayer.on('error', $.proxy(this._onError, this));

      this._videoPlayer.on('click', $.proxy(this._onClick, this));
      this._videoPlayer.on('contextMenu', $.proxy(this._onContextMenu, this));

      this._playerConfig.on('update', $.proxy(this._onPlayerConfigUpdate, this));
    },
    _onVolumeChange: function(vol) {
      this._playerConfig.setValue('volume', vol);
    },
    _onPlayerConfigUpdate: function(key, value) {
      switch (key) {
        case 'loop':
          this._videoPlayer.setIsLoop(value);
          break;
        case 'playbackRate':
          this._videoPlayer.setPlaybackRate(value);
          this._commentPlayer.setPlaybackRate(value);
          break;
        case 'autoPlay':
          this._videoPlayer.setIsAutoPlay(value);
          break;
        case 'showComment':
          if (value) {
            this._commentPlayer.show();
          } else {
            this._commentPlayer.hide();
          }
          break;
        case 'mute':
          this._videoPlayer.setMute(value);
          break;
      }
    },
    _onMouseWheel: function(e, delta) {
      var v = this._videoPlayer.getVolume();
      var r;

      // 下げる時は「うわ音でけぇ」
      // 上げる時は「ちょっと上げようかな」
      // なので下げる速度のほうが速い
      if (delta > 0) { // up
        v = Math.max(v, 0.01);
        r = (v < 0.05) ? 1.3 : 1.1;
        this._videoPlayer.setVolume(v * r);
      } else {         // down
        this._videoPlayer.setVolume(v / 1.2);
      }
//      this._playerConfig.setValue('volume', this._videoPlayer.getVolume());
    },
    _onTimer: function() {
      var currentTime = this._videoPlayer.getCurrentTime();
      this._commentPlayer.setCurrentTime(currentTime);
    },
    _onAspectRatioFix: function(ratio) {
      this._commentPlayer.setAspectRatio(ratio);
    },
    _onPlay: function() {
      this._isPlaying = true;
    },
    _onPause: function() {
      this._isPlaying = false;
    },
    _onEnded: function() {
      this._isPlaying = false;
      this._isEnded = true;
      if (FullScreen.now()) {
        FullScreen.cancel();
      }
    },
    _onError: function() {
    },
    _onAbort: function() {
    },
    _onClick: function(e) {
      this._contextMenu.hide();
    },
    _onContextMenu: function(e) {
      this._contextMenu.show(e.offsetX, e.offsetY);
    },
    setVideo: function(url) {
      this._videoPlayer.setSrc(url);
      this._controlPanel.show();
      this._isEnded = false;
    },
    setThumbnail: function(url) {
      this._videoPlayer.setThumbnail(url);
    },
    play: function() {
      this._videoPlayer.play();
    },
    pause: function() {
      this._videoPlayer.pause();
    },
    togglePlay: function() {
      this._videoPlayer.togglePlay();
    },
    setPlaybackRate: function(playbackRate) {
      playbackRate = Math.max(0, Math.min(playbackRate, 10));
      this._videoPlayer.setPlaybackRate(playbackRate);
      this._commentPlayer.setPlaybackRate(playbackRate);
    },
    setCurrentTime: function(t) {
      this._videoPlayer.setCurrentTime(Math.max(0, t));
    },
    getCurrentTime: function() {
      return this._videoPlayer.getCurrentTime();
    },
    setComment: function(xmlText) {
      this._commentPlayer.setComment(xmlText);
    },
    appendTo: function(node) {
      var $node = typeof node === 'string' ? $(node) : node;
      this._$parentNode = node;
      this._videoPlayer.appendTo($node);
      this._commentPlayer.appendTo($node);
      this._contextMenu.appendTo($node);
    },
    close: function() {
      this._videoPlayer.close();
      this._commentPlayer.close();
      this._controlPanel.hide();
    },
    toggleFullScreen: function() {
      if (FullScreen.now()) {
        FullScreen.cancel();
      } else {
        this.requestFullScreen();
      }
    },
    requestFullScreen: function() {
      FullScreen.request(this._fullScreenNode || this._$parentNode[0]);
    }
  });


  var VideoControlPanel = function() { this.initialize.apply(this, arguments); };
  VideoControlPanel.__css__ = ZenzaWatch.util.hereDoc(function() {/*
    .zenzaControlPanel {
      position: fixed;
      display: none;
      z-index: 200000;
      left: 0;
      bottom: 0;
      background: #333;
      border: 2px soid;
      padding: 4px;
      box-shadow: 0 0 4px;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
    }

    .zenzaControlPanel.show {
      display: block
    }

    .zenzaControlPanel .control {
      display: inline-block;
      border: 1px solid;
      border-radius: 4px;
      background: #888;
    }

    .zenzaControlPanel .playbackRate,
    .zenzaControlPanel .screenMode {
      font-size: 16px;
      background: #888;
    }

    .zenzaControlPanel button {
      font-size: 10pt;
      padding: 4px 8px;
      background: #888;
      border-radius: 4px;
      border: solid 1px;
      cursor: pointer;
    }

    .zenzaControlPanel label {
      padding: 4px 8px;
      cursor: pointer;
    }

    .zenzaControlPanel input[type=checkbox] {
      position: fixed;
      left: -9999px;
    }

    .zenzaControlPanel .control.checked {
      color: #cc9;
    }

  */});

  VideoControlPanel.__tpl__ = ZenzaWatch.util.hereDoc(function() {/*
    <div class="zenzaControlPanel">
      <div class="playbackRateControl control">
        再生速度
        <select class="playbackRate">
          <option value="1.0" selected>標準(1.0)</option>
          <option value="0.01">0.01倍</option>
          <option value="0.1">0.1倍</option>
          <option value="0.3">0.3倍</option>
          <option value="0.5">0.5倍</option>
          <option value="0.8">0.8倍</option>
          <option value="1.0">1.0倍</option>
          <option value="1.1">1.1倍</option>
          <option value="1.2">1.2倍</option>
          <option value="1.4">1.4倍</option>
          <option value="1.5">1.5倍</option>
          <option value="2.0">2.0倍</option>
          <option value="3.0">3.0倍</option>
          <option value="4.0">4.0倍</option>
          <option value="5.0">5.0倍</option>
          <option value="10.0">10倍</option>
        </select>
      </div>
      <div class="screenModeControl control">
        画面サイズ
        <select class="screenMode">
          <option value="3D">3D</option>
          <option value="small">小画面</option>
          <option value="sideView">横表示</option>
          <option value="normal" selected>標準</option>
          <option value="big">大画面</option>
          <option value="wide">ワイド</option>
       </select>
      </div>
      <div class="fullScreenControl control toggle">
        <button class="fullScreen">
          フルスクリーン
        </button>
      </div>
        <!--<div class="muteControl control toggle">
        <label>
          ミュート
          <input type="checkbox" class="checkbox" data-setting-name="mute">
        </label>
      </div>-->
      <div class="loopControl control toggle">
        <label>
          リピート
          <input type="checkbox" class="checkbox" data-setting-name="loop">
        </label>
      </div>
      <div class="autoPlayControl control toggle">
        <label>
          自動再生
          <input type="checkbox" class="checkbox" data-setting-name="autoPlay">
        </label>
      </div>
      <div class="showCommentControl control toggle">
        <label>
          コメント
          <input type="checkbox" class="checkbox" data-setting-name="showComment">
        </label>
      </div>
      <div class="debugControl control toggle">
        <label>
          デバッグ
          <input type="checkbox" class="checkbox" data-setting-name="debug">
        </label>
      </div>
     </div>
  */});


  _.assign(VideoControlPanel.prototype, {
    initialize: function(params) {
      this._playerConfig = params.playerConfig;
      this._player = params.player;
      this._initializeDom();

      this._playerConfig.on('update', $.proxy(this._onPlayerConfigUpdate, this));
    },
    _initializeDom: function() {
      var conf = this._playerConfig;
      ZenzaWatch.util.addStyle(VideoControlPanel.__css__);

      var $panel = this._$panel = $(VideoControlPanel.__tpl__);

      $panel.on('click', function(e) {
        e.stopPropagation();
      });

      this._$playbackRate = $panel.find('.playbackRate');
      this._$playbackRate.on('change', $.proxy(this._onPlaybackRateChange, this));
      this._$playbackRate.val(conf.getValue('playbackRate'));

      this._$screenMode = $panel.find('.screenMode');
      this._$screenMode.on('change', $.proxy(this._onScreenModeChange, this));
      this._$screenMode.val(conf.getValue('screenMode'));

      this._$fullScreenButton = $panel.find('.fullScreen');
      this._$fullScreenButton.on('click', $.proxy(this._onFullScreenClick, this));

      var $check = $panel.find('input[type=checkbox]');
      $check.each(function(i, check) {
        var $c = $(check);
        var settingName = $c.attr('data-setting-name');
        var val = conf.getValue(settingName);
        $c.prop('checked', conf.getValue(settingName));
        $c.closest('.control').toggleClass('checked', val);
      });
      $check.on('change', $.proxy(this._onToggleItemChange, this));

      $('body').append($panel);
    },
    _onPlaybackRateChange: function() {
      var val = this._$playbackRate.val();
      this._playerConfig.setValue('playbackRate', val);
    },
    _onScreenModeChange: function() {
      var val = this._$screenMode.val();
      this._playerConfig.setValue('screenMode', val);
    },
    _onFullScreenClick: function(e) {
      e.stopPropagation();
      this._player.requestFullScreen();
    },
    _onToggleItemChange: function(e) {
      var $target = $(e.target);
      var settingName = $target.attr('data-setting-name');
      var val = !!$target.prop('checked');

      this._playerConfig.setValue(settingName, val);
      $target.closest('.control').toggleClass('checked', val);
    },
    _onPlayerConfigUpdate: function(key, value) {
      switch (key) {
        case 'mute':
        case 'loop':
        case 'autoPlay':
        case 'showComment':
        case 'debug':
          this._$panel
            .find('.' + key + 'Control').toggleClass('checked', value)
            .find('input[type=checkbox]').prop('checked', value);
          break;
        case 'playbackRate':
          this._$playbackRate.val(value);
          break;
        case 'screenMode':
          this._$screenMode.val(value);
          break;
      }
    },
    show: function() {
      this._$panel.addClass('show');
    },
    hide: function() {
      this._$panel.removeClass('show');
    }
  });

  var VideoContextMenu = function() { this.initialize.apply(this, arguments); };
  VideoContextMenu.__css__ = ZenzaWatch.util.hereDoc(function() {/*
    .zenzaPlayerContextMenu {
      position: fixed;
      background: #fff;
      overflow: visible;
      padding: 8px;
      border: 1px outset #333;
      box-shadow: 2px 2px 4px #000;
      transition: opacity 0.3s ease;
      z-index: 150000;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
    }
    .zenzaPlayerContextMenu:not(.show) {
      left: -9999px;
      top: -9999px;
      opacity: 0;
    }
    .zenzaPlayerContextMenu ul li {
      position: relative;
      line-height: 120%;
      margin: 2px 8px;
      overflow-y: visible;
      white-space: nowrap;
      cursor: pointer;
      padding: 2px 8px;
      list-style-type: none;
    }
    .zenzaPlayerContextMenu ul li.selected {
      font-weight: bolder;
    }
    .zenzaPlayerContextMenu ul li:hover {
      background: #336;
      color: #fff;
    }
    .zenzaPlayerContextMenu ul li.separator {
      border: 1px outset;
      height: 2px;
    }
    .zenzaPlayerContextMenu.show {
      opacity: 1;
    }
    .zenzaPlayerContextMenu .listInner {
    }
  */});

  VideoContextMenu.__tpl__ = ZenzaWatch.util.hereDoc(function() {/*
    <div class="zenzaPlayerContextMenu">
      <div class="listInner">
        <ul>
          <li data-command="togglePlay">停止/再開</li>
          <!--<li data-command="showComment">コメント表示/非表示</li>-->
          <li data-command="restart">先頭に戻る</li>

          <hr class="separator">

          <li class="seek" data-command="seek" data-param="-10">10秒戻る</li>
          <li class="seek" data-command="seek" data-param="10" >10秒進む</li>
          <li class="seek" data-command="seek" data-param="-30">30秒戻る</li>
          <li class="seek" data-command="seek" data-param="30" >30秒進む</li>

          <hr class="separator">

          <li class="playbackRate" data-command="playbackRate" data-param="0.01">コマ送り(0.01x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="0.3">スロー再生(0.3x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="0.5">スロー再生(0.5x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="1.0">標準速度</li>
          <li class="playbackRate" data-command="playbackRate" data-param="1.2">高速(1.2x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="1.4">高速(1.4x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="1.5">高速(1.5x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="2">倍速(2x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="4">4倍速(4x)</li>
          <li class="playbackRate" data-command="playbackRate" data-param="10.0">最高速(10x)</li>
        </ul>
      </div>
    </div>
  */});


  _.assign(VideoContextMenu.prototype, {
    initialize: function(params) {
      this._playerConfig = params.playerConfig;
      this._player = params.player;
      this._initializeDom(params);

      //this._playerConfig.on('update', $.proxy(this._onPlayerConfigUpdate, this));
    },
    _initializeDom: function(params) {
      ZenzaWatch.util.addStyle(VideoContextMenu.__css__);
      var $view = this._$view = $(VideoContextMenu.__tpl__);
      $view.on('click', $.proxy(this._onMouseDown, this));
    },
    _onMouseDown: function(e) {
      var target = e.target, $target = jQuery(target);
      var command = $target.attr('data-command');
      var param = $target.attr('data-param');
      this.hide();
      e.preventDefault();
      var player = this._player;
      var playerConfig = this._playerConfig;
      switch (command) {
        case 'togglePlay':
          player.togglePlay();
          break;
//        case 'showComment':
//          break;
        case 'restart':
          player.setCurrentTime(0);
          break;
        case 'seek':
          var ct = player.getCurrentTime();
          player.setCurrentTime(ct + parseInt(param, 10));
          break;
        case 'playbackRate':
          playerConfig.setValue('playbackRate', parseFloat(param, 10));
          break;
      }
    },
    _onBodyClick: function() {
      this.hide();
    },
    _onBeforeShow: function() {
      // チェックボックスなどを反映させるならココ
      var pr = this._playerConfig.getValue('playbackRate');
      this._$view.find('.selected').removeClass('selected');
      this._$view.find('.playbackRate').each(function(i, elm) {
        var $elm = $(elm);
        var p = parseFloat($elm.attr('data-param'), 10);
        if (p == pr) {
          $elm.addClass('selected');
        }
      });
    },
    appendTo: function($node) {
      this._$node = $node;
      $node.append(this._$view);
    },
    show: function(x, y) {
      $('body').on('click.ZenzaMenuOnBodyClick', $.proxy(this._onBodyClick, this));
      var $view = this._$view, $window = $(window);

      this._onBeforeShow(x, y);

      $view.css({
        left: Math.max(0, Math.min(x, $window.innerWidth()  - $view.outerWidth())),
        top:  Math.max(0, Math.min(y, $window.innerHeight() - $view.outerHeight())),
      });
      this._$view.addClass('show');
    },
    hide: function() {
      $('body').off('click.ZenzaMenuOnBodyClick', this._onBodyClick);
      this._$view.css({top: '', left: ''}).removeClass('show');
    }
  });


  /**
   *  Video要素をラップした物
   *  操作パネル等を自前で用意したいが、まだ手が回らない。
   *  中途半端にjQuery使っててきもい
   *
   *  いずれは同じインターフェースのflash版も作って、swf/flv等の再生もサポートしたい。
   */
  var VideoPlayer = function() { this.initialize.apply(this, arguments); };
  _.assign(VideoPlayer.prototype, {
    initialize: function(params) {
      var volume =
        params.hasOwnProperty('volume') ? parseFloat(params.volume) : 0.5;
      var playbackRate = this._playbackRate =
        params.hasOwnProperty('playbackRate') ? parseFloat(params.playbackRate) : 1.0;

      var options = {
        autoPlay: !!params.autoPlay,
        autoBuffer: true,
        preload: 'auto',
        controls: true,
        loop: !!params.loop,
        mute: !!params.mute
      };

      console.log('%cinitialize VideoPlayer... ', 'background: cyan', options);
      this._$video = $('<video class="videoPlayer nico"/>').attr(options);
      this._video = this._$video[0];

      this._isPlaying = false;
      this._canPlay = false;

      var emitter = new AsyncEmitter();
      this.on        = $.proxy(emitter.on,        emitter);
      this.emit      = $.proxy(emitter.emit,      emitter);
      this.emitAsync = $.proxy(emitter.emitAsync, emitter);

      this.setVolume(volume);
      this.setPlaybackRate(playbackRate);

      this._initializeEvents();

      ZenzaWatch.debug.video = this._video;
    },
    _reset: function() {
      this._$video.removeClass('play pause abort error');
      this._isPlaying = false;
    },
    _initializeEvents: function() {
      this._$video
        .on('canplay',        $.proxy(this._onCanPlay, this))
        .on('canplaythrough', $.proxy(this._onCanPlayThrough, this))
        .on('loadstart',      $.proxy(this._onLoadStart, this))
        .on('loadeddata',     $.proxy(this._onLoadedData, this))
        .on('ended',          $.proxy(this._onEnded, this))
        .on('emptied',        $.proxy(this._onEmptied, this))
        .on('stalled',        $.proxy(this._onStalled, this))
        .on('waiting',        $.proxy(this._onWaiting, this))
        .on('progress',       $.proxy(this._onProgress, this))
        .on('durationchange', $.proxy(this._onDurationChange, this))
        .on('resize',         $.proxy(this._onResize, this))
        .on('abort',          $.proxy(this._onAbort, this))
        .on('error',          $.proxy(this._onError, this))

        .on('pause',          $.proxy(this._onPause, this))
        .on('play',           $.proxy(this._onPlay, this))
        .on('playing',        $.proxy(this._onPlaying, this))
        .on('seeking',        $.proxy(this._onSeeking, this))
        .on('seeked',         $.proxy(this._onSeeked, this))
        .on('volumechange',
            _.debounce($.proxy(this._onVolumeChange, this), 500)
        )

        .on('click',          $.proxy(this._onClick, this))
        .on('dblclick',       $.proxy(this._onDoubleClick, this))
        .on('mousewheel',     $.proxy(this._onMouseWheel, this))
        .on('contextmenu',    $.proxy(this._onContextMenu, this))
        ;
    },
    _onCanPlay: function() {
      console.log('%c_onCanPlay:', 'background: cyan; color: blue;', arguments);

      this.setPlaybackRate(this.getPlaybackRate());
      this._canPlay = true;
      this._$video.removeClass('loading');
      this.emit('canPlay');
      this.emit('aspectRatioFix',
        this._video.videoHeight / Math.max(1, this._video.videoWidth));
    },
    _onCanPlayThrough: function() {
      console.log('%c_onCanPlayThrough:', 'background: cyan;', arguments);
      this.emit('canPlayThrough');
    },
    _onLoadStart: function() {
      console.log('%c_onLoadStart:', 'background: cyan;', arguments);
      this.emit('loadStart');
    },
    _onLoadedData: function() {
      console.log('%c_onLoadedData:', 'background: cyan;', arguments);
      this.emit('loadedData');
    },
    _onEnded: function() {
      console.log('%c_onEnded:', 'background: cyan;', arguments);
      this.emit('ended');
    },
    _onEmptied: function() {
      console.log('%c_onEmptied:', 'background: cyan;', arguments);
      this.emit('emptied');
    },
    _onStalled: function() {
      console.log('%c_onStalled:', 'background: cyan;', arguments);
      this.emit('stalled');
    },
    _onWaiting: function() {
      console.log('%c_onWaiting:', 'background: cyan;', arguments);
      this.emit('waiting');
    },
    _onProgress: function() {
      //console.log('%c_onProgress:', 'background: cyan;', arguments);
      this.emit('progress');
    },
    _onDurationChange: function() {
      console.log('%c_onDurationChange:', 'background: cyan;', arguments);
      this.emit('durationChange');
    },
    _onResize: function() {
      console.log('%c_onResize:', 'background: cyan;', arguments);
      this.emit('resize');
    },
    _onAbort: function() {
      console.log('%c_onAbort:', 'background: cyan; color: red;', arguments);
      this._$video.addClass('abort');
      this.emit('abort');
    },
    _onError: function() {
      console.log('%c_onError:', 'background: cyan; color: red;', arguments);
      this._$video.addClass('error');
      this._canPlay = false;
      this.emit('error');
    },

    _onPause: function() {
      console.log('%c_onPause:', 'background: cyan;', arguments);
      this._$video.removeClass('play');

      this._isPlaying = false;
      this.emit('pause');
    },
    _onPlay: function() {
      console.log('%c_onPlay:', 'background: cyan;', arguments);
      this._$video.addClass('play');
      this._isPlaying = true;

      this.emit('play');
    },
    // ↓↑の違いがよくわかってない
    _onPlaying: function() {
      console.log('%c_onPlaying:', 'background: cyan;', arguments);
      this._isPlaying = true;
      this.emit('playing');
    },
    _onSeeking: function() {
      console.log('%c_onSeeking:', 'background: cyan;', arguments);
      this.emit('seeking', this._video.currentTime);
    },
    _onSeeked: function() {
      console.log('%c_onSeeked:', 'background: cyan;', arguments);

      // なぜかシークのたびにリセットされるので再設定 (Chromeだけ？)
      this.setPlaybackRate(this.getPlaybackRate());

      this.emit('seeked', this._video.currentTime);
    },
    _onVolumeChange: function() {
      console.log('%c_onVolumeChange:', 'background: cyan;', arguments);
      this.emit('volumeChange', this.getVolume());
    },
    _onClick: function(e) {
      this.emit('click');
    },
    _onDoubleClick: function(e) {
      console.log('%c_onDoubleClick:', 'background: cyan;', arguments);
      // Firefoxはここに関係なくプレイヤー自体がフルスクリーンになってしまう。
      // 手前に透明なレイヤーを被せるしかない？
      e.preventDefault();
      e.stopPropagation();
      this.emit('dblclick');
    },
    _onMouseWheel: function(e) {
      //console.log('%c_onMouseWheel:', 'background: cyan;', e);
      e.preventDefault();
      e.stopPropagation();
      var delta = parseInt(e.originalEvent.wheelDelta, 10);
      if (delta !== 0) {
        this.emit('mouseWheel', e, delta);
      }
    },
    _onContextMenu: function(e) {
      //console.log('%c_onContextMenu:', 'background: cyan;', e);
      e.preventDefault();
      e.stopPropagation();
      this.emit('contextMenu', e);
    },
    canPlay: function() {
      return !!this._canPlay;
    },
    play: function() {
      this._video.play();
    },
    pause: function() {
      this._video.pause();
    },
    setThumbnail: function(url) {
      console.log('%csetThumbnail: %s', 'background: cyan;', url);

      this._thumbnail = url;
      this._$video.attr('poster', url);
      //this.emit('setThumbnail', url);
    },
    setSrc: function(url) {
      console.log('%csetSc: %s', 'background: cyan;', url);

      this._reset();

      this._src = url;
      this._$video.attr('src', url);
      this._canPlay = false;
      //this.emit('setSrc', url);
      this._$video.addClass('loading');
    },
    setVolume: function(vol) {
      vol = Math.max(Math.min(1, vol), 0);
      //console.log('setVolume', vol);
      this._video.volume = vol;
    },
    getVolume: function() {
      return parseFloat(this._video.volume);
    },
    setMute: function(v) {
      this._video.muted = v;
    },
    getCurrentTime: function() {
      if (!this._canPlay) { return 0; }
      return this._video.currentTime;
    },
    setCurrentTime: function(sec) {
      var cur = this._video.currentTime;
      if (cur !== sec) {
        this._video.currentTime = sec;
        this.emit('seek', this._video.currentTime);
      }
    },
    togglePlay: function() {
      if (this._isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    },
    getVpos: function() {
      return this._video.currentTime * 100;
    },
    setVpos: function(vpos) {
      this._video.currentTime = vpos / 100;
    },
    getIsLoop: function() {
      return !!this._video.loop;
    },
    setIsLoop: function(v) {
      this._video.loop = !!v;
    },
    setPlaybackRate: function(v) {
      console.log('setPlaybackRate', v);
      // たまにリセットされたり反映されなかったりする？
      this._playbackRate = v;
      var video = this._video;
      video.playbackRate = 1;
      window.setTimeout(function() { video.playbackRate = parseFloat(v); }, 100);
    },
    getPlaybackRate: function() {
      return this._playbackRate; //parseFloat(this._video.playbackRate) || 1.0;
    },
    setIsAutoPlay: function(v) {
      this._video.autoPlay = v;
    },
    getIsAutoPlay: function() {
      return this._video.autoPlay;
    },
    appendTo: function($node) {
      $node.append(this._$video);
      this._video = document.getElementsByTagName('video')[0];
    },
    close: function() {
      this._video.pause();
      // ISSUE: srcを空にする方法はないものか。data schemeで何かつっこむ？
      this._video.src    = 'http://example.com/';// undefined;
      this._video.poster = 'http://example.com/';//undefined;
    }
  });

//==================================================
//==================================================
//==================================================
  /**
   * コメント描画まわり。MVVMもどき
   * 追加(投稿)はまだサポートしてない。
   *
   * Model
   *  コメントのデータ構造
   *
   * ViowModel
   *  コメントの表示位置・タイミング等を計算する担当。
   *  この実装ではあらかじめ全て計算してしまう。
   *  停止した時間の中で一生懸命ナイフを並べるDIOのような存在
   *
   * View
   *  そして時は動きだす・・・。
   *  ViewModelが算出した結果を基に実際の描画を担当する。
   *  あらかじめ全て計算済みなので、静的なHTMLを吐き出す事もできる。
   *  将来的にはChromecastのようなデバイスに描画したりすることも。
   *
   *  コメントを静的なCSS3アニメーションとして保存
   *  console.log(ZenzaWatch.debug.css3Player.toString())*
   */
  var NicoCommentPlayer = function() { this.initialize.apply(this, arguments); };
  _.assign(NicoCommentPlayer.prototype, {
    initialize: function(params) {
      var emitter = new AsyncEmitter();
      this.on        = $.proxy(emitter.on,        emitter);
      this.emit      = $.proxy(emitter.emit,      emitter);
      this.emitAsync = $.proxy(emitter.emitAsync, emitter);
      
      this._offScreen = params.offScreenLayer;

      this._model     = new NicoComment(params);
      this._viewModel = new NicoCommentViewModel(this._model, params.offScreenLayer);
      this._view      = new NicoCommentCss3PlayerView({
        viewModel: this._viewModel,
        playbackRate: params.playbackRate,
        show: params.showComment
      });
    },
    setComment: function(xmlText) {
      var parser = new DOMParser();
      var xml = parser.parseFromString(xmlText, 'text/xml');
      this._model.setXml(xml);
    },
    loadFromXmlText: function(xmlText) {
      console.log('load from XmlText...');
      var parser = new DOMParser();
      var xml = parser.parseFromString(xmlText, 'text/xml');
      return this._model.setXml(xml);
    },
    getCss3PlayerHtml: function() {
      console.log('createCss3PlayerHtml...');

      if (this._view) {
        return this._view.toString();
      }

      this._view = new NicoCommentCss3PlayerView({
        viewModel: this._viewModel
      });
      return this._view.toString();
    },
    setCurrentTime: function(sec) {
      this._model.setCurrentTime(sec);
    },
    setVpos: function(vpos) {
      this._model.setCurrentTime(vpos / 100);
    },
    getCurrentTime: function() {
      return this._model.getCurrentTime();
    },
    getVpos: function() {
      return this._model.getCurrentTime() * 100;
    },
    setVisibility: function(v) {
      if (v) {
        this._view.show();
      } else {
        this._view.hide();
      }
    },
    addComment: function(chat, cmd, vpos, options) {
      // model側がDOMParser以外を受けられるようにすべき
      var _chat = {
        getAttribute: function(name) {
          return this.hasOwnProperty(name) ? this[name] : undefined;
        },
        firstChild: {nodeValue: chat},
        vpos: vpos,
        mail: chat
      };
      _.assign(_chat, options);
      this._model.addChat(_chat);
    },
    setPlaybackRate: function(playbackRate) {
      if (this._view && this._view.setPlaybackRate) {
        this._view.setPlaybackRate(playbackRate);
      }
    },
    setAspectRatio: function(ratio) {
      this._view.setAspectRatio(ratio);
    },
    appendTo: function($node) {
      this._view.appendTo($node);
    },
    show: function() {
      this._view.show();
    },
    hide: function() {
      this._view.hide();
    },
    close: function() {
      this._model.clear();
    },
    toString: function() {
      return this._viewModel.toString();
    }
  });




  var NicoComment = function() { this.initialize.apply(this, arguments); };
  NicoComment.MAX_COMMENT = 1000;

  _.assign(NicoComment.prototype, {
    initialize: function() {
      this._currentTime = 0;
      var emitter = new AsyncEmitter();
      this.on        = $.proxy(emitter.on,        emitter);
      this.emit      = $.proxy(emitter.emit,      emitter);
      this.emitAsync = $.proxy(emitter.emitAsync, emitter);

      this._topGroup    = new NicoChatGroup(this, NicoChat.TYPE.TOP);
      this._normalGroup = new NicoChatGroup(this, NicoChat.TYPE.NORMAL);
      this._bottomGroup = new NicoChatGroup(this, NicoChat.TYPE.BOTTOM);
    },
    setXml: function(xml) {
      console.time('NicoComment.setXml');

      this._xml = xml;
      this._topGroup.reset();
      this._normalGroup.reset();
      this._bottomGroup.reset();
      var chats = xml.getElementsByTagName('chat');

      for (var i = 0, len = Math.min(chats.length, NicoComment.MAX_COMMENT); i < len; i++) {
        var chat = chats[i];
        if (!chat.firstChild) continue;

        var nicoChat = new NicoChat(chat);

        if (nicoChat.isDeleted()) { continue; }

        var type = nicoChat.getType();
        var group;
        switch (type) {
          case NicoChat.TYPE.TOP:
            group = this._topGroup;
            break;
          case NicoChat.TYPE.BOTTOM:
            group = this._bottomGroup;
            break;
          default:
            group = this._normalGroup;
            break;
        }
        group.addChat(nicoChat, group);
      }

      console.timeEnd('NicoComment.setXml');
      console.log('chats: ', chats.length);
      console.log('top: ',    this._topGroup   .getMembers().length);
      console.log('normal: ', this._normalGroup.getMembers().length);
      console.log('bottom: ', this._bottomGroup.getMembers().length);
      this.emit('setXml');
    },
    addChat: function(nicoChat) {
      if (nicoChat.isDeleted()) { return; }
      var type = nicoChat.getType();
      var group;
      switch (type) {
        case NicoChat.TYPE.TOP:
          group = this._topGroup;
          break;
        case NicoChat.TYPE.BOTTOM:
          group = this._bottomGroup;
          break;
        default:
          group = this._normalGroup;
          break;
      }
      group.addChat(nicoChat, group);
      this.emit('addChat');
    },
    clear: function() {
      this._xml = '';
      this._topGroup.reset();
      this._normalGroup.reset();
      this._bottomGroup.reset();
      this.emit('clear');
    },
    getCurrentTime: function() {
      return this._currentTime;
    },
    setCurrentTime: function(sec) {
      this._currentTime = sec;

      this._topGroup   .setCurrentTime(sec);
      this._normalGroup.setCurrentTime(sec);
      this._bottomGroup.setCurrentTime(sec);

      this.emit('currentTime', sec);
    },
    seek: function(time) {
      this.setCurrentTime(time);
    },
    setVpos: function(vpos) {
      this.setCurrentTime(vpos / 100);
    },
    getGroup: function(type) {
      switch (type) {
        case NicoChat.TYPE.TOP:
          return this._topGroup;
        case NicoChat.TYPE.BOTTOM:
          return this._bottomGroup;
        default:
          return this._normalGroup;
      }
    }
  });

  // フォントサイズ計算用の非表示レイヤーを取得
  // 変なCSSの影響を受けないように、DOM的に隔離されたiframe内で計算する。
  NicoComment.offScreenLayer = (function() {
    var __offscreen_tpl__ = ZenzaWatch.util.hereDoc(function() {/*
    <!DOCTYPE html>
    <html lang="ja">
    <head>
    <meta charset="utf-8">
    <title>CommentLayer</title>
    <style type="text/css">
      .mincho  {font-family: "ＭＳ Ｐ明朝", monospace, Simsun; }
      .gulim   {font-family: "ＭＳ Ｐ明朝", monospace, Gulim; }
      .mingLiu {font-family: "ＭＳ Ｐ明朝", monospace, mingLiu; }
      .mincho2  {font-family: "ＭＳ 明朝", monospace, Simsun; }
      .gulim2   {font-family: "ＭＳ 明朝", Gmonospace, ulim; }
      .mingLiu2 {font-family: "ＭＳ 明朝", mmonospace, ingLiu; }

      .ue .mincho  , .shita .mincho {font-family: "ＭＳ 明朝", monospace, Simsun; }
      .ue .gulim   , .shita .gulim  {font-family: "ＭＳ 明朝", monospace, Gulim; }
      .ue .mingLiu , .shita .mingLiu{font-family: "ＭＳ 明朝", monospace, mingLiu; }

      .nicoChat .zen_space {
        {*font-family: monospace;*}
      }
    </style>
    <body style="pointer-events: none;" >
    <div id="offScreenLayer"
      style="
        width: 4096px;
        height: 385px;
        overflow: visible;
        background: #fff;

        font-family: 'ＭＳ Ｐゴシック';
        letter-spacing: 1px;
        margin: 2px 1px 1px 1px;
        white-space: nowrap;
        font-weight: bolder;

    "></div>
    </body></html>
      */});

    var emitter = new AsyncEmitter();
    var offScreenFrame;
    var offScreenLayer;
    var textField;

    var initialize = function($d) {
      initialize = _.noop;
      var frame = document.createElement('iframe');
      frame.className = 'offScreenLayer';
      document.body.appendChild(frame);
      frame.style.position = 'fixed';
      frame.style.top = '200vw';
      frame.style.left = '200vh';
      
      offScreenFrame = frame;

      var layer;
      frame.onload = function() {
        frame.onload = _.noop;

        console.log('%conOffScreenLayerLoad', 'background: lightgreen;');
        createTextField();
        layer = offScreenFrame.contentWindow.document.getElementById('offScreenLayer');

        offScreenLayer = {
          getTextField: function() {
            return textField;
          },
          appendChild: function(elm) {
            layer.appendChild(elm);
          },
          removeChild: function(elm) {
            layer.removeChild(elm);
          }
        };

        emitter.emit('create', offScreenLayer);
        emitter.clear();
        $d.resolve(offScreenLayer);
      };

      frame.srcdoc = __offscreen_tpl__;
    };

    var getLayer = function(callback) {
      var $d = new $.Deferred();
      callback = callback || _.noop;
      if (offScreenLayer) {
        window.setTimeout(function() {
          callback(offScreenLayer);
        }, 0);
        $d.resolve(offScreenLayer);
        return;
      }
      emitter.on('create', callback);

      initialize($d);
      return $d.promise();
    };

    var createTextField = function() {
      var layer = offScreenFrame.contentWindow.document.getElementById('offScreenLayer');
      if (!layer) {
        return false;
      }

      var span = document.createElement('span');
      span.style.position   = 'absolute';
      span.style.fontWeight = 'bolder';
      span.style.whiteSpace = 'nowrap';

      textField = {
        setText: function(text) {
          span.innerHTML = text;
        },
        setType: function(type) {
          span.className = type;
        },
        setFontSizePixel: function(pixel) {
          span.style.fontSize = pixel + 'px';
        },
        getWidth: function() {
          return span.offsetWidth;
        }
      };

      layer.appendChild(span);
  
      return span;
    };

    return {
      get: getLayer
    };
  })();



  var NicoCommentViewModel = function() { this.initialize.apply(this, arguments); };

  // この数字はレイアウト計算上の仮想領域の物であり、実際に表示するサイズはview依存
  NicoCommentViewModel.SCREEN = {
    WIDTH:      512 + 32,
    WIDTH_FULL: 640 + 32,
    HEIGHT:     384 +  1
  };

  _.assign(NicoCommentViewModel.prototype, {
    initialize: function(nicoComment, offScreen) {
      this._nicoComment = nicoComment;
      this._offScreen   = offScreen;

      var emitter = new AsyncEmitter();
      this.on        = $.proxy(emitter.on,        emitter);
      this.emit      = $.proxy(emitter.emit,      emitter);
      this.emitAsync = $.proxy(emitter.emitAsync, emitter);

      this._currentTime = 0;

      this._topGroup =
        new NicoChatGroupViewModel(nicoComment.getGroup(NicoChat.TYPE.TOP), offScreen);
      this._normalGroup =
        new NicoChatGroupViewModel(nicoComment.getGroup(NicoChat.TYPE.NORMAL), offScreen);
      this._bottomGroup =
        new NicoChatGroupViewModel(nicoComment.getGroup(NicoChat.TYPE.BOTTOM), offScreen);

      nicoComment.on('setXml', $.proxy(this._onSetXml, this));
      nicoComment.on('clear',  $.proxy(this._onClear,  this));
      nicoComment.on('currentTime', $.proxy(this._onCurrentTime,   this));
    },
    _onSetXml: function() {
      this.emit('setXml');
    },
    _onClear: function() {
      this._topGroup.reset();
      this._normalGroup.reset();
      this._bottomGroup.reset();

      this.emit('clear');
    },
    _onCurrentTime: function(sec) {
      this._currentTime = sec;
      this.emit('currentTime', this._currentTime);
    },
    getCurrentTime: function() {
      return this._currentTime;
    },
    toString: function() {
      var result = [];

      result.push(['<comment ',
        '>'
      ].join(''));

      result.push(this._normalGroup.toString());
      result.push(this._topGroup.toString());
      result.push(this._bottomGroup.toString());

      result.push('</comment>');
      return result.join('\n');
    },
    getGroup: function(type) {
      switch (type) {
        case NicoChat.TYPE.TOP:
          return this._topGroup;
        case NicoChat.TYPE.BOTTOM:
          return this._bottomGroup;
        default:
          return this._normalGroup;
      }
    }
});

  var NicoChatGroup = function() { this.initialize.apply(this, arguments); };

  _.assign(NicoChatGroup.prototype, {
    initialize: function(nicoComment, type) {
      this._nicoComment = nicoComment;
      this._type = type;

      // TODO: mixin
      var emitter = new AsyncEmitter();
      this.on        = $.proxy(emitter.on,        emitter);
      this.emit      = $.proxy(emitter.emit,      emitter);
      this.emitAsync = $.proxy(emitter.emitAsync, emitter);

      this.reset();
    },
    reset: function() {
      this._members = [];
    },
    addChatArray: function(nicoChatArray) {
      var members = this._members;
      $(nicoChatArray).each(function(i, nicoChat) {
        members.push(nicoChat);
      });
      this.emit('addChatArray', nicoChatArray);
    },
    addChat: function(nicoChat) {
      this._members.push(nicoChat);
      this.emit('addChat', nicoChat);
    },
    getType: function() {
      return this._type;
    },
    getMembers: function() {
      return this._members;
    },
    getFilteredMembers: function() {
      // TODO: NG, deleted 判定
      return this._members;
    },
    getCurrentTime: function() {
      return this._currentTime;
    },
    setCurrentTime: function(sec) {
      this._currentTime = sec;
      var m = this._members;
      for (var i = 0, len = m.length; i < len; i++) {
        m[i].setCurrentTime(sec);
      }
    }
  });

  var NicoChatGroupViewModel = function() { this.initialize.apply(this, arguments); };

  _.assign(NicoChatGroupViewModel.prototype, {
    initialize: function(nicoChatGroup, offScreen) {
      this._nicoChatGroup = nicoChatGroup;
      this._offScreen = offScreen;
      this._members = [];

      // メンバーをvposでソートした物. 計算効率改善用
      this._vSortedMembers = [];

      nicoChatGroup.on('addChat',      $.proxy(this._onAddChat,      this));
      nicoChatGroup.on('addChatArray', $.proxy(this._onAddChatArray, this));
      nicoChatGroup.on('reset',        $.proxy(this._onReset,        this));

      this.addChatArray(nicoChatGroup.getFilteredMembers());
    },
    _onAddChatArray: function(nicoChatArray) {
      this.addChatArray(nicoChatArray);
    },
    _onAddChat: function(nicoChat) {
      this.addChatArray([nicoChat]);
    },
    _onReset: function() {
      this.reset();
    },
    addChatArray: function(nicoChatArray) {
      for (var i = 0, len = nicoChatArray.length; i < len; i++) {
        var nicoChat = nicoChatArray[i];
        var nc = new NicoChatViewModel(nicoChat, this._offScreen);
        this.checkCollision(nc);
        this._members.push(nc);
      }
      this._createVSortedMembers();
    },
    addChat: function(nicoChat) {
      var nc = new NicoChatViewModel(nicoChat, this._offScreen);
      this.checkCollision(nc);
      this._members.push(nc);

      this._createVSortedMembers();
    },
    reset: function() {
      var m = this._members;
      for (var i = 0, len = m.length; i < len; i++) {
        m[i].reset();
      }

      this._members = [];
      this._vSortedMembers = [];
    },
    getCurrentTime: function() {
      return this._nicoChatGroup.getCurrentTime();
    },
    getType: function() {
      return this._nicoChatGroup.getType();
    },
    checkCollision: function(target) {
      // 判定はidの若い奴優先なのか左にある奴優先なのかいまいちわかってない
      // 後者だとコメントアートに割り込み出来てしまうから前者？
      var m = this._vSortedMembers;//this._members;
      var o;
      for (var i = 0, len = m.length; i < len; i++) {
        o = m[i];

        //自分自身との判定はスキップする
        if (o === target) { continue; }

        if (o.checkCollision(target)) {
          target.moveToNextLine(o);

          // ずらした後は再度全チェックするのを忘れずに(再帰)
          if (!target.isOverflow()) {
            this.checkCollision(target);
            return;
          }
        }
      }
    },

    /**
     * vposでソートされたメンバーを生成. 計算効率改善用
     */
    _createVSortedMembers: function() {
      this._vSortedMembers = this._members.concat().sort(function(a, b) {
        return a.getVpos() - b.getVpos();
      });
      return this._vSortedMembers;
    },

    getMembers: function() {
      return this._members;
    },

    /**
     * 現時点で表示状態のメンバーのみを返す
     */
    getInViewMembers: function() {
      return this.getInViewMembersBySecond(this.getCurrentTime());
    },

    /**
     * secの時点で表示状態のメンバーのみを返す
     */
    getInViewMembersBySecond: function(sec) {
      // TODO: もっと効率化
      //var maxDuration = NicoChatViewModel.DURATION.NORMAL;

      var result = [], m = this._vSortedMembers, len = m.length;
      for (var i = 0; i < len; i++) {
        var chat = m[i]; //, s = m.getBeginLeftTiming();
        //if (sec - s > maxDuration) { break; }
        if (chat.isInViewBySecond(sec)) {
          result.push(chat);
        }
      }
      //console.log('inViewMembers.length: ', result.length, sec);
      return result;
    },
    getInViewMembersByVpos: function(vpos) {
      if (!this._hasLayout) { this._layout(); }
      return this.getInViewMembersBySecond(vpos / 100);
    },
    toString: function() {
      var result = [], m = this._members, len = m.length;

      result.push(['\t<group ',
        'type="',   this._nicoChatGroup.getType(), '" ',
        'length="', m.length, '" ',
        '>'
      ].join(''));

      for (var i = 0; i < len; i++) {
        result.push(m[i].toString());
      }

      result.push('\t</group>');
      return result.join('\n');
    }
  });




  /**
   * コメントの最小単位
   *
   */
  var NicoChat = function() { this.initialize.apply(this, arguments); };

  NicoChat.id = 0;

  NicoChat.SIZE = {
    BIG: 'big',
    MEDIUM: 'medium',
    SMALL: 'small'
  };
  NicoChat.TYPE = {
    TOP:    'ue',
    NORMAL: 'normal',
    BOTTOM: 'shita'
  };
  NicoChat._CMD_REPLACE = /(ue|shita|sita|big|small|ender|full|[ ])/g;
  NicoChat._COLOR_MATCH = /(#[0-9a-f]+)/i;
  NicoChat._COLOR_NAME_MATCH = /([a-z]+)/i;
  NicoChat.COLORS = {
    'red'    : '#FF0000',
    'pink'   : '#FF8080',
    'orange' : '#FFC000',
    'yellow' : '#FFFF00',
    'green'  : '#00FF00',
    'cyan'   : '#00FFFF',
    'blue'   : '#0000FF',
    'purple' : '#C000FF',
    'black'  : '#000000',

    'white2'         : '#CCCC99',
    'niconicowhite'  : '#CCCC99',
    'red2'           : '#CC0033',
    'truered'        : '#CC0033',
    'pink2'          : '#FF33CC',
    'orange2'        : '#FF6600',
    'passionorange'  : '#FF6600',
    'yellow2'        : '#999900',
    'madyellow'      : '#999900',
    'green2'         : '#00CC66',
    'elementalgreen' : '#00CC66',
    'cyan2'          : '#00CCCC',
    'blue2'          : '#3399FF',
    'marineblue'     : '#3399FF',
    'purple2'        : '#6633CC',
    'nobleviolet'    : '#6633CC',
    'black2'         : '#666666'
  };

  _.assign(NicoChat.prototype, {
    reset: function() {
      this._text = '';
      this._date = '000000000';
      this._cmd =  '';
      this._isPremium = false;
      this._userId = '';
      this._vpos = 0;
      this._deleted = '';
      this._color = '#FFF';
      this._size = NicoChat.SIZE.MEDIUM;
      this._type = NicoChat.TYPE.NORMAL;
      this._isMine = false;

      this._currentTime = 0;
    },
    initialize: function(chat) {
      this._id = 'chat' + NicoChat.id++;
      this._currentTime = 0;

      this._text = chat.firstChild.nodeValue;
      var attr = chat.attributes;
      if (!attr) { this.reset(); return; }

      this._date = chat.getAttribute('date') || '000000000';
      this._cmd  = chat.getAttribute('mail') || '';
      this._isPremium = (chat.getAttribute('premium') === '1');
      this._userId = chat.getAttribute('user_id');
      this._vpos = parseInt(chat.getAttribute('vpos'));
      this._deleted = chat.getAttribute('deleted') === '1';
      this._color = '#FFF';
      this._size = NicoChat.SIZE.MEDIUM;
      this._type = NicoChat.TYPE.NORMAL;
      this._duration = NicoChatViewModel.DURATION.NORMAL;
      this._isMine = !!chat.isMine;

      if (this._deleted) { return; }

      var cmd = this._cmd;
      if (cmd.length > 0) {
        var pcmd = this._parseCmd(cmd);

        if (pcmd['COLOR']) {
          this._color = pcmd['COLOR'];
        }

        // TODO: 両方指定されてたらどっちが優先されるのかを検証
        if (pcmd['big']) {
          this._size = NicoChat.SIZE.BIG;
        } else if (pcmd['small']) {
          this._size = NicoChat.SIZE.SMALL;
        }

        if (pcmd['ue']) {
          this._type = NicoChat.TYPE.TOP;
        } else if (pcmd['shita']) {
          this._type = NicoChat.TYPE.BOTTOM;
        }

        if (pcmd['ender']) {
          this._isEnder = true;
        }
        if (pcmd['full']) {
          this._isFull = true;
        }
      }
    },
    _parseCmd: function(cmd) {
      var tmp = cmd.split(/ +/);
      var result = {};
      $(tmp).each(function(i, c) {
        if (NicoChat.COLORS[c]) {
          result['COLOR'] = NicoChat.COLORS[c];
        } else if (NicoChat._COLOR_MATCH.test(c)) {
          result['COLOR'] = c;
        } else {
          result[c] = true;
        }
      });
      return result;
    },
    setCurrentTime: function(sec) {
      this._currentTime = sec;
    },
    getCurrentTime: function() {
      return this._currentTime;
    },
    getId: function() { return this._id; },
    getText: function() { return this._text; },
    getDate: function() { return this._date; },
    getCmd: function() { return this._cmd; },
    isPremium: function() { return !!this._isPremium; },
    isEnder: function() { return !!this._isEnder; },
    isFull: function() { return !!this._isFull; },
    isMine: function() { return !!this._isMine; },
    getUserId: function() { return this._userId; },
    getVpos: function() { return this._vpos; },
    isDeleted: function() { return !!this._deleted; },
    getColor: function() { return this._color; },
    getSize: function() { return this._size; },
    getType: function() { return this._type; }
  });


  /**
   * 個別のコメントの表示位置・タイミング計算
   * コメントアート互換は大体こいつにかかっている
   */
  var NicoChatViewModel = function() { this.initialize.apply(this, arguments); };
  // ここの値はレイアウト計算上の仮想領域の物であり、実際の表示はviewに依存
  NicoChatViewModel.DURATION = {
    TOP:    3,
    NORMAL: 4,
    BOTTOM: 3
  };

  NicoChatViewModel.FONT = '\'ＭＳ Ｐゴシック\''; // &#xe7cd;
  NicoChatViewModel.FONT_SIZE_PIXEL = {
    BIG: 39,
    NORMAL: 24,
    SMALL: 15
  };

  NicoChatViewModel.LINE_HEIGHT = {
    BIG: 45,
    NORMAL: 29,
    SMALL: 18
  };

  NicoChatViewModel.CHAT_MARGIN = 5;
  
  NicoChatViewModel._FONT_REG = {
    // [^ -~。-゜]* は半角以外の文字の連続
    MINCHO: /([^ -~。-゜]*[ˊˋ⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⒒⒓⒔⒕⒖⒗⒘⒙⒚⒛▁▂▃▄▅▆▇█▉▊▋▌▍▎▏◢◣◤◥〡〢〣〤〥〦〧〨〩ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ︰︱︳︴︵︶︷︸︹︺︻︼︽︾︿﹀﹁﹂﹃﹄﹉﹊﹋﹌﹍﹎﹏﹐﹑﹒﹔﹕﹖﹗﹙﹚﹛﹜﹝﹞﹟﹠﹡﹢﹣﹤﹥﹦﹨﹩﹪﹫▓]+[^ -~。-゜]*)/g,
    GULIM: /([^ -~。-゜]*[㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉㈊㈋㈌㈍㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗㈘㈙㈚㈛㈜㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻㉿ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵￦⊙ㅂㅑㅜㆁ▒ㅅㅒㅡㆍㄱㅇㅓㅣㆎㄴㅏㅕㅤ♡ㅁㅐㅗㅿ♥]+[^ -~。-゜]*)/g,
    MING_LIU: /([^ -~。-゜]*[]+[^ -~。-゜]*)/g
  };

  _.assign(NicoChatViewModel.prototype, {
    initialize: function(nicoChat, offScreen) {
      this._nicoChat = nicoChat;
      this._offScreen = offScreen;

      // 画面からはみ出したかどうか(段幕時)
      this._isOverflow = false;
      // 表示時間
      this._duration = NicoChatViewModel.DURATION.NORMAL;

      // 固定されたコメントか、流れるコメントか
      this._isFixed = false;

      this._scale = 1.0;
      this._y = 0;

      this._setType(nicoChat.getType());

      // ここでbeginLeftTiming, endRightTimintが確定する
      this._setVpos(nicoChat.getVpos());

      this._setSize(nicoChat.getSize());

      // 文字を設定
      // この時点で字幕の大きさが確定するので、
      // Z座標・beginRightTiming, endLeftTimingまでが確定する
      this._setText(nicoChat.getText());

      if (this._isFixed) {
        this._setupFixedMode();
      } else {
        this._setupMarqueeMode();
      }

      // この時点で画面の縦幅を超えるようなコメントは縦幅に縮小しつつoverflow扱いにしてしまう
      // こんなことをしなくてもおそらく本家ではぴったり合うのだろうし苦し紛れだが、
      // 画面からはみ出すよりはマシだろうという判断
      if (this._height > NicoCommentViewModel.SCREEN.HEIGHT) {
        this._isOverflow = true;
        //this._y = (NicoCommentViewModel.SCREEN.HEIGHT - this._height) / 2;
        this._setScale(this._scale * NicoCommentViewModel.SCREEN.HEIGHT / this._height);
      }
    },
    _setType: function(type) {
      this._type = type;
      switch (type) {
        case NicoChat.TYPE.TOP:
          this._duration = NicoChatViewModel.DURATION.TOP;
          this._isFixed = true;
          break;
        case NicoChat.TYPE.BOTTOM:
          this._duration = NicoChatViewModel.DURATION.BOTTOM;
          this._isFixed = true;
          break;
        default:
          break;
      }
    },
    _setVpos: function(vpos) {
      switch (this._type) {
        case NicoChat.TYPE.TOP:
          this._beginLeftTiming = vpos / 100;
          break;
        case NicoChat.TYPE.BOTTOM:
          this._beginLeftTiming = vpos / 100;
          break;
        default:
          this._beginLeftTiming = vpos / 100 - 1;
          break;
      }
      this._endRightTiming = this._beginLeftTiming + this._duration;
    },
    _setSize: function(size) {
      this._size = size;
      switch (size) {
        case NicoChat.SIZE.BIG:
          this._fontSizePixel = NicoChatViewModel.FONT_SIZE_PIXEL.BIG;
          break;
        case NicoChat.SIZE.SMALL:
          this._fontSizePixel = NicoChatViewModel.FONT_SIZE_PIXEL.SMALL;
          break;
        default:
          this._fontSizePixel = NicoChatViewModel.FONT_SIZE_PIXEL.NORMAL;
          break;
      }
    },
    _setText: function(text) {
      var htmlText =
        text
          .replace(/[ \xA0]/g , '<span class="han_space">_</span>')
          .replace(/[\t]/g , '&nbsp;');
          //.replace(/[\t \xA0]/g , '')
//          .replace(/　/g , '<span class="zen_space">□</span>')
//          .replace(/[\n]/g, '#<br>');

      // 特殊文字と、その前後の全角文字のフォントが変わるらしい
      htmlText =
        htmlText
          .replace(NicoChatViewModel._FONT_REG.MINCHO,   '<span class="mincho">$1</span>')
          .replace(NicoChatViewModel._FONT_REG.GULIM,    '<span class="gulim">$1</span>')
          .replace(NicoChatViewModel._FONT_REG.MING_LIU, '<span class="mingLiu">$1</span>')
          .replace(/　/g , '<span class="zen_space">、</span>')
          .replace(/ /g , '<span class="zen_space">＃</span>');

      // 最初の一文字目が特殊文字だった場合は全体のフォントが変わるらしい
      var firstLetter = text.charAt(0);
      if (firstLetter.match(NicoChatViewModel._FONT_REG.MINCHO)) {
        htmlText = '<span class="mincho">'  + htmlText + '</span>';
      } else if (firstLetter.match(NicoChatViewModel._FONT_REG.GULIM)) {
        htmlText = '<span class="gulim">'   + htmlText + '</span>';
      } else if (firstLetter.match(NicoChatViewModel._FONT_REG.MING_LIU)) {
        htmlText = '<span class="mingLiu">' + htmlText + '</span>';
      }
      htmlText = htmlText
        .replace(/[\r\n]+$/g, '')
        .replace(/[\n]$/g, '<br><span class="han_space">|</span>')
        .replace(/[\n]/g, '<br>');

      this._htmlText = htmlText;
      this._text = text;

      var field = this._offScreen.getTextField();
      field.setText(htmlText);
      field.setFontSizePixel(this._fontSizePixel);
      field.setType(this._type);
      
      this._width  = this._originalWidth  = field.getWidth();
      this._height = this._originalHeight = this._calculateHeight();

      if (!this._isFixed) {
        var speed =
          this._speed = (this._width + NicoCommentViewModel.SCREEN.WIDTH) / this._duration;
        this._endLeftTiming    = this._endRightTiming  - this._width / speed;
        this._beginRightTiming = this._beginLeftTiming + this._width / speed;
      } else {
        this._speed = 0;
        this._endLeftTiming    = this._endRightTiming;
        this._beginRightTiming = this._beginLeftTiming;
      }
    },
    /**
     * 高さ計算。 リサイズ後が怪しいというか多分間違ってる。
     */
    _calculateHeight: function() {
      // ブラウザから取得したouterHeightを使うより、職人の実測値のほうが信頼できる
      // http://tokeiyadiary.blog48.fc2.com/blog-entry-90.html
      // http://www37.atwiki.jp/commentart/pages/43.html#id_a759b2c2
      var lc = this._htmlText.split('<br>').length;

      var margin     = NicoChatViewModel.CHAT_MARGIN;
      var lineHeight = NicoChatViewModel.LINE_HEIGHT.NORMAL; // 29
      var size       = this._size;
      switch (size) {
        case NicoChat.SIZE.BIG:
          lineHeight = NicoChatViewModel.LINE_HEIGHT.BIG;    // 45
          break;
        default:
          break;
        case NicoChat.SIZE.SMALL:
          lineHeight = NicoChatViewModel.LINE_HEIGHT.SMALL;  // 18
          break;
      }

      if (!this._isFixed) {
        // 流れるコメント
        // 中の数字は職人の実測値
        switch (size) {
          case NicoChat.SIZE.BIG:
            lineHeight = lc <= 2 ? lineHeight : 24;
            margin     = lc <= 2 ? margin : 3;
            //return ((lc <= 2) ? (45 * lc + 5) : (24 * lc + 3)) - 1;
            break;
          default:
            lineHeight = lc <= 4 ? lineHeight : 15;
            margin     = lc <= 4 ? margin : 3;
            //return ((lc <= 4) ? (29 * lc + 5) : (15 * lc + 3)) - 1;
            break;
          case NicoChat.SIZE.SMALL:
            lineHeight = lc <= 6 ? lineHeight : 10;
            margin     = lc <= 6 ? margin : 3;
            //return ((lc <= 6) ? (18 * lc + 5) : (10 * lc + 3)) - 1;
            break;
        }
      } else if (this._scale === 0.5) {
        switch (size) {
          case NicoChat.SIZE.BIG: // 16行 = (24 * 16 + 3 - 1) = 386
            lineHeight = 24;
            margin     = 3;
            //return (24 * lc + 3) - 1;
            break;
          default:
            lineHeight = 15;
            margin     = 3;
            //return (15 * lc + 3) - 1;
            break;
          case NicoChat.SIZE.SMALL:
            lineHeight = 10;
            margin     = 3;
            //return (10 * lc + 3) - 1;
            break;
        }
      } else if (this._scale !== 1.0) {
        /**
         *  上の実測に合うようなCSSを書ければ色々解決する。今後の課題
         */
        //console.log(calc(39,1)==45,calc(24,1)==29,calc(15,1)==18,calc(39,.5)==24,calc(24,.5)==15,calc(15,.5)==10)
        //  45 -> 24
        //  29 -> 15
        //  18 -> 10
        lineHeight = Math.floor((lineHeight + Math.ceil(lineHeight / 15)) * this._scale);
        margin     = Math.round(margin * this._scale);
      }

      this._lineHeight = lineHeight;
      return lineHeight * lc  + margin - 1;
    },

    /**
     *  位置固定モードにする(ueかshita)
     */
    _setupFixedMode: function() {
      var isScaled = false;
      var nicoChat = this._nicoChat;
      var screenWidth =
        nicoChat.isFull() ?
          NicoCommentViewModel.SCREEN.WIDTH_FULL :
          NicoCommentViewModel.SCREEN.WIDTH;
      var screenHeight = NicoCommentViewModel.SCREEN.HEIGHT;
      //メモ
      //█　　　　　　　　　　　　　　　　　　　　　　　　　　　█
      // メモ
      // "        "

      // 改行リサイズ
      // 参考: http://ch.nicovideo.jp/meg_nakagami/blomaga/ar217381
      // 画面の高さの1/3を超える場合は大きさを半分にする
      if (this._height > screenHeight / 3) {
        this._setScale(this._scale * 0.5);
        isScaled = true;
      }
      
      // TODO: この判定は改行リサイズより前？後？を検証
      var isOverflowWidth = this._width > screenWidth;

      // 横幅リサイズ
      // 画面幅よりデカい場合の調整
      if (isOverflowWidth) {
        if (isScaled && !nicoChat.isEnder()) {
          // なんかこれバグってね？と思った方は正しい。
          // 元々は本家のバグなのだが、いまさら修正出来ない。
          // なので、コメント描画の再現としては正しい…らしい。
          //
          // そのバグを発動しなくするためのコマンドがender
          this._setScale(screenWidth / this._width);
        } else {
          this._setScale(this._scale * (screenWidth  / this._width));
        }
      }

      // BOTTOMの時だけy座標を画面の下端に合わせる
      // 内部的には0 originで表示の際に下から詰むだけでもいいような気がしてきた。
      if (this._type === NicoChat.TYPE.BOTTOM) {
        var margin = 1; //NicoChatViewModel.CHAT_MARGIN;
        var outerHeight = this._height + margin;
        this._y = screenHeight - outerHeight;
      }

    },

    /**
     *  流れる文字のモード
     */
    _setupMarqueeMode: function() {
      var screenHeight = NicoCommentViewModel.SCREEN.HEIGHT;
      // 画面の高さの1/3を超える場合は大きさを半分にする
      if (this._height > screenHeight / 3) {
        this._setScale(this._scale * 0.5);
        var speed =
          this._speed = (this._width + NicoCommentViewModel.SCREEN.WIDTH) / this._duration;
        this._endLeftTiming    = this._endRightTiming  - this._width / speed;
        this._beginRightTiming = this._beginLeftTiming + this._width / speed;
      }
    },

    _setScale: function(scale) {
      this._scale = scale;
      this._width = (this._originalWidth * scale);
      this._height = this._calculateHeight(); // 再計算
    },

    /**
     * コメント同士の衝突を判定
     *
     * @param {NicoChatViewModel} o
     * @return boolean
     */
    checkCollision: function(target) {
      // 一度はみ出した文字は当たり判定を持たない
      if (this.isOverflow() || target.isOverflow()) { return false; }

      // Y座標が合わないなら絶対衝突しない
      var targetY = target.getYpos();
      var selfY   = this.getYpos();
      if (targetY + target.getHeight() < selfY ||
          targetY > selfY + this.getHeight()) {
        return false;
      }

      // ターゲットと自分、どっちが右でどっちが左か？の判定
      var rt, lt;
      if (this.getBeginLeftTiming() <= target.getBeginLeftTiming()) {
        lt = this;
        rt = target;
      } else {
        lt = target;
        rt = this;
      }

      if (this._isFixed) {

        // 左にあるやつの終了より右にあるやつの開始が早いなら、衝突する
        // > か >= で挙動が変わるCAがあったりして正解がわからない
        if (lt.getEndRightTiming() > rt.getBeginLeftTiming()) {
          return true;
        }

      } else {

        // 左にあるやつの右端開始よりも右にあるやつの左端開始のほうが早いなら、衝突する
        if (lt.getBeginRightTiming() >= rt.getBeginLeftTiming()) {
          return true;
        }

        // 左にあるやつの右端終了よりも右にあるやつの左端終了のほうが早いなら、衝突する
        if (lt.getEndRightTiming() >= rt.getEndLeftTiming()) {
          return true;
        }

      }

      return false;
    },

    /**
     * (衝突判定に引っかかったので)自分自身を一段ずらす.
     *
     * @param NicoChatViewModel others 示談相手
     */
    moveToNextLine: function(others) {
      var margin = 1; //NicoChatViewModel.CHAT_MARGIN;
      var othersHeight = others.getHeight() + margin;
      var yMax = NicoCommentViewModel.SCREEN.HEIGHT - this._height; //lineHeight;

      var type = this._nicoChat.getType();
      var y = this._y;

      if (type !== NicoChat.TYPE.BOTTOM) {
        y += othersHeight;
        // 画面内に入りきらなかったらランダム配置
        if (y > yMax) {
          this._isOverflow = true;
        }
      } else {
        y -= othersHeight;
        // 画面内に入りきらなかったらランダム配置
        if (y < 0) {
          this._isOverflow = true;
        }
      }

      this._y = this._isOverflow ? Math.floor(Math.random() * yMax) : y;
    },

    reset: function() {
    },

    getId: function() {
      return this._nicoChat.getId();
    },
    getText: function() {
      return this._text;
    },
    getHtmlText: function() {
      return this._htmlText;
    },
    isInView: function() {
      return this.isInViewBySecond(this.getCurrentTime());
    },
    isInViewBySecond: function(sec) {
      if (sec + 1 /* margin */ < this._beginLeftTiming) { return false; }
      if (sec > this._endRightTiming ) { return false; }
      return true;
    },
    isOverflow: function() {
      return this._isOverflow;
    },
    getWidth: function() {
      return this._width;
    },
    getHeight: function() {
      return this._height;
    },
    getDuration: function() {
      return this._duration;
    },
    getSpeed: function() {
      return this._speed;
    },
    // 左端が見えるようになるタイミング
    getBeginLeftTiming: function() {
      return this._beginLeftTiming;
    },
    // 右端が見えるようになるタイミング
    getBeginRightTiming: function() {
      return this._beginRightTiming;
    },
    // 左端が見えなくなるタイミング
    getEndLeftTiming: function() {
      return this._endLeftTiming;
    },
    // 右端が見えなくなるタイミング
    getEndRightTiming: function() {
      return this._endRightTiming;
    },
    getVpos: function() {
      return this._nicoChat.getVpos();
    },
    getXpos: function() {
      return this.getXposBySecond(this.getCurrentTime());
    },
    getYpos: function() {
      return this._y;
    },
    getColor: function() {
      return this._nicoChat.getColor();
    },
    getSize: function() {
      return this._nicoChat.getSize();
    },
    getType: function() {
      return this._nicoChat.getType();
    },
    getScale: function() {
      return this._scale;
    },
    getFontSizePixel: function() {
      return this._fontSizePixel;
    },
    getLineHeight: function() {
      return this._lineHeight;
    },
    /**
     * second時の左端座標を返す
     */
    getXposBySecond: function(sec) {
      if (this._isFixed) {
        return (NicoCommentViewModel.SCREEN.WIDTH - this._width) / 2;
      } else {
        var diff = sec - this._beginLeftTiming;
        return NicoCommentViewModel.SCREEN.WIDTH + diff * this._speed;
      }
    },
    getXposByVpos: function(vpos) {
      return this.getXposBySecond(vpos / 100);
    },
    getCurrentTime: function() {
      return this._nicoChat.getCurrentTime();
    },
    isFull: function() {
      return this._nicoChat.isFull();
    },
    toString: function() { // debug用
      // コンソールから
      // ZenzaWatch.debug.getInViewElements()
      // 叩いた時にmeta中に出る奴
      var chat = JSON.stringify({
        width:    this.getWidth(),
        height:   this.getHeight(),
        scale:    this.getScale(),
        fontSize: this.getFontSizePixel(),
        vpos:     this.getVpos(),
        xpos:     this.getXpos(),
        ypos:     this.getYpos(),
        type:     this.getType(),
        begin:    this.getBeginLeftTiming(),
        end:      this.getEndRightTiming(),
        speed:    this.getSpeed(),
        color:    this.getColor(),
        size:     this.getSize(),
        duration: this.getDuration(),
        inView:   this.isInView(),

        ender:    this._nicoChat.isEnder(),
        full:     this._nicoChat.isFull(),
        userId:   this._nicoChat.getUserId(),
        date:     this._nicoChat.getDate(),
        deleted:  this._nicoChat.isDeleted(),
        cmd:      this._nicoChat.getCmd(),
        text:     this.getText()
      });
      return chat;
    }
  });


//==================================================
//==================================================
//==================================================
  /**
   * ニコニコ動画のコメントをCSS3アニメーションだけで再現出来るよ
   * という一発ネタのつもりだったのだが意外とポテンシャルが高かった。
   *
   * DOM的に隔離されたiframeの領域内で描画する
   */
  var NicoCommentCss3PlayerView = function() { this.initialize.apply(this, arguments); };

  NicoCommentCss3PlayerView.MAX_DISPLAY_COMMENT = 40;

  NicoCommentCss3PlayerView.__TPL__ = ZenzaWatch.util.hereDoc(function() {/*
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>CommentLayer</title>
<style type="text/css">

.mincho  {font-family: "ＭＳ Ｐ明朝", monospace, Simsun;  }
.mincho  {font-family: "ＭＳ Ｐ明朝", monospace, Simsun;  }
.mincho  {font-family: "ＭＳ Ｐ明朝", monospace, Simsun;  }
.gulim   {font-family: "ＭＳ 明朝", monospace, Gulim;   }
.mingLiu {font-family: "ＭＳ 明朝", monospace, mingLiu; }
.mincho2  {font-family: "ＭＳ 明朝", monospace, Simsun;  }
.gulim2   {font-family: "ＭＳ 明朝", monospace, Gulim;   }
.mingLiu2 {font-family: "ＭＳ 明朝", monospace, mingLiu; }

.ue .mincho  , .shita .mincho {font-family: "ＭＳ 明朝", monospace, Simsun; }
.ue .gulim   , .shita .gulim  {font-family: "ＭＳ 明朝", monospace, Gulim; }
.ue .mingLiu , .shita .mingLiu{font-family: "ＭＳ 明朝", monospace, mingLiu; }

.debug .mincho  { background: rgba(128, 0, 0, 0.3); }
.debug .gulim   { background: rgba(0, 128, 0, 0.3); }
.debug .mingLiu { background: rgba(0, 0, 128, 0.3); }

body {
  marign: 0;
  padding: 0;
  overflow: hidden;
  pointer-events: none;
}

{* 稀に変な広告が紛れ込む *}
iframe {
  display: none !important;
}

.commentLayerOuter {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 672px;
  padding: 0 64px;
  height: 385px;
  right: 0;
  bottom: 0;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
}

.commentLayer {
  position: relative;
  width: 544px;
  height: 385px;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.debug .commentLayer {
  border: 1px dotted #800;
}

.nicoChat {
  position: absolute;
  opacity: 0;
  text-shadow:
  {*-1px -1px 0 #ccc, *}
     1px  1px 0 #000;

  font-family: 'ＭＳ Ｐゴシック';
  letter-spacing: 1px;
  margin: 2px 1px 1px 1px;
  white-space: nowrap;
  font-weight: bolder;

{*line-height: 123.5%;*}
  padding: 0;

  transform-origin: 0% 0%;
  animation-timing-function: linear;
}

.nicoChat.black {
  text-shadow: -1px -1px 0 #888, 1px  1px 0 #888;
}

.nicoChat.big {
  line-height: 48px;
}

.nicoChat.medium {
  line-height: 31px;
}

.nicoChat.small {
  line-height: 18px;
}

.nicoChat.overflow {
  {*mix-blend-mode: overlay;*}
}


.nicoChat.ue,
.nicoChat.shita {
  display: inline-block;
  text-shadow: 0 0 3px #000; {* 全部こっちにしたいが重いので *}
  {*text-align: center;*}
}
.nicoChat.ue.black,
.nicoChat.shita.black {
  text-shadow: 0 0 3px #fff; {* 全部こっちにしたいが重いので *}
}

.nicoChat .han_space,
.nicoChat .zen_space {
  opacity: 0;
  {*font-family: monospace;*}
}

.debug .nicoChat .han_space,
.debug .nicoChat .zen_space {
  color: yellow;
  opacity: 0.3;
}

.debug .nicoChat.ue {
  text-decoration: overline;
}

.debug .nicoChat.shita {
  text-decoration: underline;
}

.nicoChat.mine {
  border: 1px solid yellow;
}

.debug .nicoChat {
  border: 1px outset;
}

.stalled .nicoChat,
.paused  .nicoChat {
  animation-play-state: paused !important;
}
</style>
<style id="nicoChatAnimationDefinition">
%CSS%
</style>
</head>
<body>
<div class="commentLayerOuter">
<div class="commentLayer" id="commentLayer">%MSG%</div>
</div>
</body></html>

  */});

  _.assign(NicoCommentCss3PlayerView.prototype, {
    initialize: function(params) {
      this._viewModel = params.viewModel;

      this._viewModel.on('setXml', $.proxy(this._onSetXml, this));
      this._viewModel.on('currentTime', $.proxy(this._onCurrentTime, this));

      this._lastCurrentTime = 0;
      this._isShow = true;

      this._aspectRatio = 9 / 16;

      this._inViewTable = {};
      this._playbackRate = params.playbackRate || 1.0;

      this._isStalled = undefined;
      this._isPaused  = undefined;

      console.log('NicoCommentCss3PlayerView playbackRate', this._playbackRate);

      this._initializeView(params);

      // Firefoxでフルスクリーン切り替えするとコメントの描画が止まる問題の暫定対処
      // ここに書いてるのは手抜き
      ZenzaWatch.emitter.on('fullScreenStatusChange',
        _.debounce($.proxy(function() {
          this.refresh();
        }, this), 3000)
      );

      ZenzaWatch.debug.css3Player = this;
    },
    _initializeView: function(params) {

      console.time('initialize NicoCommentCss3PlayerView');
      this._style = null;
      this._commentLayer = null;
      this._view = null;
      var iframe = document.createElement('iframe');
      iframe.className = 'commentLayerFrame';

      var html =
        NicoCommentCss3PlayerView.__TPL__
        .replace('%CSS%', '').replace('%MSG%', '');


      var self = this;
      iframe.onload = function() {
        var win = iframe.contentWindow;
        var doc = iframe.contentWindow.document;

        self._style        = doc.getElementById('nicoChatAnimationDefinition');
        var commentLayer = self._commentLayer = doc.getElementById('commentLayer');

        // Config直接参照してるのは手抜き
        doc.body.className = Config.getValue('debug') ? 'debug' : '';
        Config.on('update-debug', function(val) {
          doc.body.className = val ? 'debug' : '';
        });

        win.addEventListener('resize', function() {
          var w = win.innerWidth, h = win.innerHeight;
          // 基本は元動画の縦幅合わせだが、16:9より横長にはならない
          var aspectRatio = Math.max(self._aspectRatio, 9 / 16);
          var targetHeight = Math.min(h, w * aspectRatio);
          commentLayer.style.transform = 'scale(' + targetHeight / 385 + ')';
        });
        //win.addEventListener('resize', _.debounce($.proxy(self._onResizeEnd, self), 500);
        //
        ZenzaWatch.debug.getInViewElements = function() {
          return doc.getElementsByClassName('nicoChat');
        };

        if (self._isPaused) {
          self.pause();
        }

        console.timeEnd('initialize NicoCommentCss3PlayerView');
      };

      iframe.srcdoc = html;
      this._view = iframe;
      ZenzaWatch.debug.commentLayer = iframe;

      if (!params.show) { this.hide(); }
    },
    _onResize: function(e) {
      this._adjust(e);
    },
    // リサイズイベントを発動させる
    _adjust: function() {
      if (!this._view) {
        return;
      }
      var $view = $(this._view);
      $view.css({ width: 1, height: 1 }).offset();
      window.setTimeout(function() {
        $view.css({width: '', height: ''});
      }, 0);
    },
    getView: function() {
      return this._view;
    },
    setPlaybackRate: function(playbackRate) {
      this._playbackRate = Math.min(Math.max(playbackRate, 0.01), 10);
      this.refresh();
    },
    setAspectRatio: function(ratio) {
      this._aspectRatio = ratio;
      this._adjust();
    },
    _onSetXml: function() {
      this.clear();
      this._adjust();
    },
    _onCurrentTime: function(sec) {
      var REFRESH_THRESHOLD = 1;
      this._lastCurrentTime = this._currentTime;
      this._currentTime = sec;

      if (this._lastCurrentTime === this._currentTime) {
        // pauseでもないのにcurrentTimeの更新が途絶えたらロードが詰まった扱い
        if (!this._isPaused) {
          this._setStall(true);
        }
      } else
      if (this._currentTime < this._lastCurrentTime ||
        Math.abs(this._currentTime - this._lastCurrentTime) > REFRESH_THRESHOLD) {
        // 後方へのシーク、または 境界値以上の前方シーク時は全体を再描画
        this.refresh();
      } else {
        this._setStall(false);
        this._updateInviewElements();
      }
    },
    _addClass: function(name) {
      if (!this._commentLayer) { return; }
      var cn = this._commentLayer.className.split(/ +/);
      if (_.indexOf(cn, name) >= 0) { return; }

      cn.push(name);
      this._commentLayer.className = cn.join(' ');
    },
    _removeClass: function(name) {
      if (!this._commentLayer) { return; }
      var cn = this._commentLayer.className.split(/ +/);
      if (_.indexOf(cn, name) < 0) { return; }

      _.pull(cn, name);
      this._commentLayer.className = cn.join(' ');
    },
    _setStall: function(v) {
      if (this._commentLayer) {
        if (v) { this._addClass('stalled'); }
        else   { this._removeClass('stalled'); }
      }
      this._isStalled = v;
    },
    pause: function() {
      if (this._commentLayer) {
        this._addClass('paused');
      }
      this._isPaused = true;
    },
    play: function() {
      if (this._commentLayer) {
        this._removeClass('paused');
      }
      this._isPaused = false;
    },
    clear: function() {
      if (this._commentLayer) {
        this._commentLayer.innerHTML = '';
      }
      if (this._style) {
        this._style.innerHTML = '';
      }

      this._inViewTable = {};
    },
    refresh: function() {
      this.clear();
      this._updateInviewElements();
    },
    _updateInviewElements: function() {
      if (!this._commentLayer || !this._style || !this._isShow) { return; }

      var groups = [
        this._viewModel.getGroup(NicoChat.TYPE.NORMAL),
        this._viewModel.getGroup(NicoChat.TYPE.BOTTOM),
        this._viewModel.getGroup(NicoChat.TYPE.TOP)
      ];

      var css = [], inView = [], dom = [];
      var i, len;
      // 表示状態にあるchatを集める
      for(i = 0, len = groups.length; i < len; i++) {
        var group = groups[i];
        inView = inView.concat(group.getInViewMembers());
      }

      var ct = this._currentTime;
      for (i = 0, len = inView.length; i < len; i++) {
        var nicoChat = inView[i];
        var domId = nicoChat.getId();
        if (this._inViewTable[domId]) {
          continue;
        }
        // 新規に表示状態になったchatがあればdom生成
        this._inViewTable[domId] = nicoChat;
        var type = nicoChat.getType();
        var size = nicoChat.getSize();
        dom.push(this._buildChatDom(nicoChat, type, size));
        css.push(this._buildChatCss(nicoChat, type, ct));
      }

      // DOMへの追加
      if (css.length > 0) {
        var fragment = document.createDocumentFragment();
        while (dom.length > 0) { fragment.appendChild(dom.shift()); }
        this._commentLayer.appendChild(fragment);
        this._style.innerHTML += css.join('');
        this._gcInviewElements();
      }
    },
    /**
     * 表示された要素を古い順に除去していく
     * 本家は単純なFIFOではなく、画面からいなくなった要素から除去→FIFOの順番だと思うが、
     * そこを再現するメリットもないと思うので手抜きしてFIFOしていく
     */
    _gcInviewElements: function() {
      if (!this._commentLayer || !this._style) { return; }

      var max = NicoCommentCss3PlayerView.MAX_DISPLAY_COMMENT;

      var commentLayer = this._commentLayer;
      var inViewElements = commentLayer.getElementsByClassName('nicoChat');
      for (var i = inViewElements.length - max - 1; i >= 0; i--) {
        inViewElements[i].remove();
      }
    },

    buildHtml: function(currentTime) {
      currentTime = currentTime || this._viewModel.getCurrentTime();
      console.time('buildHtml');

      var groups = [
        this._viewModel.getGroup(NicoChat.TYPE.NORMAL),
        this._viewModel.getGroup(NicoChat.TYPE.BOTTOM),
        this._viewModel.getGroup(NicoChat.TYPE.TOP)
      ];

      var css = [], html = [];
      for(var i = 0; i < groups.length; i++) {
        var group = groups[i];
        html.push(this._buildGroupHtml(group, currentTime));
        css .push(this._buildGroupCss(group, currentTime));
      }

      var tpl = NicoCommentCss3PlayerView.__TPL__;

      tpl = tpl.replace('%CSS%', css.join(''));
      tpl = tpl.replace('%MSG%', html.join(''));

      console.timeEnd('buildHtml');
      return tpl;
    },

    _buildGroupHtml: function(group, currentTime) {
      var m = group.getMembers();
      var type = group.getType();
      var result = [];
      for(var i = 0, len = m.length; i < len; i++) {
        var chat = m[i];
        result.push(this._buildChatHtml(chat, type /*, currentTime */));
      }
      return result.join('\n');
    },
    _buildGroupCss: function(group, currentTime) {
      var m = group.getMembers();
      var type = group.getType();
      var result = [];
      for(var i = 0, len = m.length; i < len; i++) {
        var chat = m[i];
        result.push(this._buildChatCss(chat, type, currentTime));
      }
      return result.join('\n');
    },
    _buildChatDom: function(chat , type, size) {
      var span = document.createElement('span');
      var className = ['nicoChat',type, size];
      if (chat.getColor() === '#000000') {
        className.push('black');
      }
      if (chat.isOverflow()) {
        className.push('overflow');
      }
      //if (chat.isMine()) { className.push('mine'); }

      span.className = className.join(' ');
      span.id = chat.getId();
      span.innerHTML = chat.getHtmlText();
      span.setAttribute('data-meta', chat.toString());
      return span;
    },
    _buildChatHtml: function(chat , type /*, currentTime */) {
      var className = 'nicoChat ' + type;
      if (chat.isOverflow()) {
        className += ' overflow';
      }
      //if (chat.isMine()) { className += ' mine'; }

      var result = [
        '<span id="', chat.getId(), '" class="', className, '">',
          chat.getHtmlText(),
        '</span>'
      ];
      return result.join('');
    },
    _buildChatCss: function(chat, type, currentTime) {
      var result;
      var scaleCss;
      var id = chat.getId();
      var duration = chat.getDuration() / this._playbackRate;
      var scale = chat.getScale();
      var beginL = chat.getBeginLeftTiming();
      var screenWidth = NicoCommentViewModel.SCREEN.WIDTH;
      var width = chat.getWidth();
//      var height = chat.getHeight();
      var ypos = chat.getYpos();
      var color = chat.getColor();
      var fontSizePx = chat.getFontSizePixel();
      var lineHeight = chat.getLineHeight();
      var speed = chat.getSpeed();
      var delay = (beginL - currentTime) / this._playbackRate;
      // 本家は「古いコメントほど薄くなる」という仕様だが、特に再現するメリットもなさそうなので
      var opacity = chat.isOverflow() ? 0.8 : 1;
      //var zid = parseInt(id.substr('4'), 10);
      //var zIndex = 10000 - (zid % 5000);
      var zIndex = beginL;

      if (type === NicoChat.TYPE.NORMAL) {
        scaleCss = (scale === 1.0) ? '' : (' scale(' + scale + ')');

        result = ['',
          ' @keyframes idou', id, ' {\n',
          '    0%  {opacity: ', opacity, '; transform: translate(0px, 0px) ', scaleCss, ';}\n',
          '  100%  {opacity: ', opacity, '; transform: translate(', - (screenWidth + width), 'px, 0px) ', scaleCss, ';}\n',
          ' }\n',
          '',
          ' #', id, ' {\n',
          '  z-index: ', zIndex , ';\n',
          '  top:', ypos, 'px;\n',
          '  left:', screenWidth, 'px;\n',
          '  color:', color,';\n',
          '  font-size:', fontSizePx, 'px;\n',
//          '  line-height:',  lineHeight, 'px;\n',
          '  animation-name: idou', id, ';\n',
          '  animation-duration: ', duration, 's;\n',
          '  animation-delay: ', delay, 's;\n',
          ' }\n',
          '\n\n'];
      } else {
        scaleCss =
          scale === 1.0 ?
            ' transform: translate(-50%, 0);' :
            (' transform: translate(-50%, 0) scale(' + scale + ');');

        //var left = ((screenWidth - width) / 2);
        result = ['',
          ' @keyframes fixed', id, ' {\n',
          '    0% {opacity: ', opacity, ';}\n',
          '  100% {opacity: ', 0.5, ';}\n',
          ' }\n',
          '',
          ' #', id, ' {\n',
          '  z-index: ', zIndex, ';\n',
          '  top:', ypos, 'px;\n',
          '  left: 50% ;\n',
          '  color:',  color, ';\n',
          '  font-size:', fontSizePx,  'px;\n',
//          '  line-height:', lineHeight,  'px;\n',
          '  width:', width, 'px;\n',
//          '  height:', height, 'px;\n',
          scaleCss,
          '  animation-name: fixed', id, ';\n',
          '  animation-duration: ', duration, 's;\n',
          '  animation-delay: ', delay, 's;\n',
          ' }\n',
          '\n\n'];
      }

      return result.join('') + '\n';
    },
    show: function() {
      if (!this._isShow) {
        this.refresh();
      }
      console.log('show!');
      this._isShow = true;
    },
    hide: function() {
      this.clear();
      this._isShow = false;
    },
    appendTo: function($node) {
      //var $view = $(this._view);
      //$view.css({width: 1}).offset();
      $node.append(this._view);

      // リサイズイベントを発動させる。 バッドノウハウ的
      //window.setTimeout(function() { $view.css({width: ''}); }, 1000);
    },
    /**
     * toStringで、コメントを静的なCSS3アニメーションHTMLとして出力する。
     * 生成されたHTMLを開くだけで、スクリプトもなにもないのに
     * ニコニコ動画のプレイヤーのようにコメントが流れる。 ふしぎ！
     */
    toString: function() {
      return this.buildHtml(0);
    }
  });

//==================================================
//==================================================
//==================================================

  var NicoVideoPlayerDialog = function() { this.initialize.apply(this, arguments); };

  NicoVideoPlayerDialog.__tpl__ = ZenzaWatch.util.hereDoc(function() {/*
    <div class="zenzaVideoPlayerDialog">
      <div class="zenzaVideoPlayerDialogInner">
        <div class="menuContainer"></div>

        <div class="videoTagContainer"></div>
        <div class="zenzaPlayerContainer">
          <div class="closeButton">×</div>
        </div>

        <div class="rightPanelContainer"></div>
      </div>
    </div>
  */});
  NicoVideoPlayerDialog.__css__ = ZenzaWatch.util.hereDoc(function() {/*

    body.zenzaScreenMode_sideView {
      margin-left: 424px;
      width: auto;
    }
    body.zenzaScreenMode_wide {
      overflow: hidden;
    }

    .zenzaVideoPlayerDialog {
      display: none;
      position: fixed;
      background: rgba(0, 0, 0, 0.8);
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 100000;
      transition:
        width: 0.4s ease-in, height: 0.4s ease-in 0.4s,
        right 0.4s ease-in, bottom 0.4s ease-in;
    }
    .zenzaVideoPlayerDialog.show {
      display: block;
    }

    .zenzaScreenMode_small .zenzaVideoPlayerDialog,
    .zenzaScreenMode_sideView .zenzaVideoPlayerDialog {
      position: fixed;
      top: 0; left: 0; right: 100%; bottom: 100%;
    }

    .zenzaVideoPlayerDialogInner {
      position: fixed;
      top:  50%;
      left: 50%;
      background: #000;
      box-sizing: border-box;
      transform: translate(-50%, -50%);
      z-index: 100001;
      box-shadow: 4px 4px 4px #000;
      transition: top 0.4s ease-in, left 0.4s ease-in;
    }

    .zenzaScreenMode_small .zenzaVideoPlayerDialogInner,
    .zenzaScreenMode_sideView .zenzaVideoPlayerDialogInner {
      top: 0;
      left: 0;
      transform: none;
    }
    .zenzaScreenMode_small .zenzaVideoPlayerDialogInner:hover {
      opacity: 0.8;
    }

    .zenzaPlayerContainer {
      position: relative;
      {* overflow: hidden; *}
      background: #000;
      width: 672px;
      height: 385px;
      transition: width 0.5s ease-in 0.7s, height 0.5s ease-in;
    }

    .zenzaScreenMode_small .zenzaPlayerContainer,
    .zenzaScreenMode_sideView .zenzaPlayerContainer {
      width: 400px;
      height: 225px;
    }

    .zenzaScreenMode_big .zenzaPlayerContainer {
      width: 896px;
      height: 480px;
    }

    .zenzaScreenMode_wide .zenzaPlayerContainer {
      width: 100vw;
      height: calc(100vh - 100px);
      box-shadow: none;
    }

    .zenzaPlayerContainer .videoPlayer {
      position: absolute;
      top: 0;
      left: 2.38%;
      width: 95.23%;
      right: 0;
      bottom: 0;
      height: 100%;
      border: 0;
      z-index: 100;
      cursor: none;
    }

    .zenzaScreenMode_big .zenzaPlayerContainer .videoPlayer {
      width: 95.31%;
      left: 2.34%;
    }

    .mouseMoving .videoPlayer {
      cursor: auto;
    }

    .zenzaScreenMode_small .videoPlayer,
    .zenzaScreenMode_wide  .videoPlayer {
      left: 0;
      width: 100%;
    }

    .fullScreen .videoPlayer,
    .fullScreen .commentLayerFrame {
      top:  0 !important;
      left: 0 !important;
      width:  100% !important;
      height: 100% !important;
      right:  0 !important;
      bottom: 0 !important;
      border: 0 !important;
      z-index: 100 !important;
     }
    {*
    .zenzaScreenMode_big .zenzaPlayerContainer {
      width: 854px;
      height: 480px;
    }
    *}

    .zenzaScreenMode_wide .zenzaPlayerContainer {
      left: 0;
      width: 100vw;
      height: calc(100vh - 100px);
    }


    .zenzaScreenMode_3D .zenzaPlayerContainer .videoPlayer {
      transform: perspective(600px) rotateX(10deg);
      height: 100%;
    }

    .fullScreen.zenzaScreenMode_3D .zenzaPlayerContainer .videoPlayer {
      transform: perspective(700px) rotateX(10deg);
      margin-top: -5%;
    }

    .zenzaScreenMode_3D .zenzaPlayerContainer .commentLayerFrame {
      transform: perspective(600px) rotateY(30deg) rotateZ(-15deg) rotateX(15deg);
      opacity: 0.8;
      height: 100%;
      margin-left: 20%;
    }

    .fullScreen .zenzaPlayerContainer {
      left: 0 !important;
      top:  0 !important;
      width:  100vw !important;
      height: 100vh !important;
    }


    .zenzaPlayerContainer .commentLayerFrame {
      position: absolute;
      border: 0;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      z-index: 101;
      transition: opacity 1s ease, height 0.4s ease;
      pointer-events: none;
      transform: translateZ(0);
      cursor: none;
    }

    .mouseMoving .commentLayerFrame {
      {* height: calc(100% - 50px); *}
      cursor: auto;
    }


    .closeButton {
      position: absolute;
      cursor: pointer;
      width: 32px;
      height: 32px;
      text-align: center;
      line-height: 32px;
      top: 0;
      right: 0;
      z-index: 110;
      margin: 0 0 40px 40px;
      opacity: 0;
      background: #000;
      color: #ccc;
      border: solid 1px;
      transition: opacity 0.4s ease;
      pointer-events: auto;
    }

    .mouseMoving .closeButton,
    .closeButton:hover {
      opacity: 0.9;
    }

    .zenzaScreenMode_big .closeButton {
      position: fixed;
      top: 0;
      right: 0;
    }


    .videoTagContainer, .menuContainer, .rightPanelContainer {
      display: none; {* 未実装 *}
    }

  */});

  _.assign(NicoVideoPlayerDialog.prototype, {
    initialize: function(params) {
      this._offScreenLayer = params.offScreenLayer;
      this._playerConfig = params.playerConfig;
      this._keyEmitter = params.keyHandler || ShortcutKeyEmitter;

      this._playerConfig.on('update-screenMode', $.proxy(this._updateScreenMode, this));
      this._initializeDom(params);

      this._keyEmitter.on('keyDown', $.proxy(this._onKeyDown, this));
    },
    _initializeDom: function() {
      ZenzaWatch.util.addStyle(NicoVideoPlayerDialog.__css__);
      var $dialog = this._$dialog = $(NicoVideoPlayerDialog.__tpl__);

      this._$playerContainer = $dialog.find('.zenzaPlayerContainer');
      this._$playerContainer.on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
      })
        .on('mousemove', $.proxy(this._onMouseMove, this))
        .on('mousemove', _.debounce($.proxy(this._onMouseMoveEnd, this), 2000));

      $dialog.on('click', $.proxy(this._onClick, this));
      $dialog.find('.closeButton')
        .on('click', $.proxy(this._onCloseButtonClick, this));

      $('body').append($dialog);
    },
    _onKeyDown: function(name /*, target */) {
      if (!this._isOpen) {
        return;
      }
      switch (name) {
        case 'SPACE':
        case 'PAUSE':
          this._nicoVideoPlayer.togglePlay();
          break;
        case 'ESC':
          if (!FullScreen.now()) {
            this.close();
          }
          break;
        case 'FULL':
          this._nicoVideoPlayer.requestFullScreen();
          break;
        case 'VIEW_COMMENT':
          var v = this._playerConfig.getValue('showComment');
          this._playerConfig.setValue('showComment', !v);
          break;
      }
    },
    _onMouseMove: function() {
      this._$playerContainer.addClass('mouseMoving');
    },
    _onMouseMoveEnd: function() {
      this._$playerContainer.removeClass('mouseMoving');
    },
    _updateScreenMode: function(mode) {
      this._clearClass();
      $('body').addClass('zenzaScreenMode_' + mode);
    },
    _clearClass: function() {
      var modes = [
        'zenzaScreenMode_3D',
        'zenzaScreenMode_small',
        'zenzaScreenMode_sideView',
        'zenzaScreenMode_small',
        'zenzaScreenMode_big',
        'zenzaScreenMode_wide',
      ].join(' ');
      $('body').removeClass(modes);
    },
    _onClick: function(e) {
    },
    _onCloseButtonClick: function(e) {
      if (FullScreen.now()) {
        FullScreen.cancel();
      } else {
        console.log('onCloseButtonClick', e);
        this.close();
      }
    },
    show: function() {
      this._$dialog.addClass('show');
      if (!FullScreen.now()) {
        $('body').removeClass('fullScreen');
      }
      $('body').addClass('showNicoVideoPlayerDialog');
      this._updateScreenMode(this._playerConfig.getValue('screenMode'));
      this._isOpen = true;
    },
    hide: function() {
      this._$dialog.removeClass('show');
      $('body').removeClass('showNicoVideoPlayerDialog');
      this._clearClass();
      this._isOpen = false;
    },
    open: function(watchId, options) {
      var nicoVideoPlayer = this._nicoVideoPlayer;
      if (!nicoVideoPlayer) {
        console.log('new nicovideoPlayer');
        this._nicoVideoPlayer = nicoVideoPlayer = new NicoVideoPlayer({
          offScreenLayer: this._offScreenLayer,
          node: this._$playerContainer,
          volume: Config.getValue('volume'),
          loop: Config.getValue('loop'),
          playerConfig: Config
        });
      } else {
        nicoVideoPlayer.close();
      }

      this._bindLoaderEvents();

      console.time('VideoInfoLoader');
      VideoInfoLoader.load(watchId);

      this.show(options);
    },
    /**
     *  ロード時のイベントを貼り直す
     */
    _bindLoaderEvents: function() {
      if (this._onVideoInfoLoaderLoad_proxy) {
        VideoInfoLoader.off('load', this._onVideoInfoLoaderLoad_proxy);
        CommentLoader  .off('load', this._onCommentLoaderLoad_proxy);
      }
      this._onVideoInfoLoaderLoad_proxy = $.proxy(this._onVideoInfoLoaderLoad, this);
      this._onCommentLoaderLoad_proxy   = $.proxy(this._onCommentLoaderLoad,   this);
      VideoInfoLoader.on('load', this._onVideoInfoLoaderLoad_proxy);
      CommentLoader  .on('load', this._onCommentLoaderLoad_proxy);
    },
    _onVideoInfoLoaderLoad: function(videoInfo, type) {
      console.timeEnd('VideoInfoLoader');
      console.log('VideoInfoLoader.load!', videoInfo, type);

      if (type !== 'WATCH_API') {
        this._nicoVideoPlayer.setThumbnail(videoInfo.thumbImage);
        this._nicoVideoPlayer.setVideo(videoInfo.url);
        console.time('CommentLoader');
        CommentLoader.load(
          videoInfo.ms,
          videoInfo.thread_id,
          videoInfo.l,
          videoInfo.user_id,
          videoInfo.needs_key === '1',
          videoInfo.optional_thread_id
        );
      } else {
        var flvInfo   = videoInfo.flvInfo;
        var videoUrl  = flvInfo.url;
        this._nicoVideoPlayer.setThumbnail(videoInfo.thumbnail);
        this._nicoVideoPlayer.setVideo(videoUrl);

        console.time('CommentLoader');
        CommentLoader.load(
          flvInfo.ms,
          flvInfo.thread_id,
          flvInfo.l,
          flvInfo.user_id,
          flvInfo.needs_key === '1',
          flvInfo.optional_thread_id
        );
      }
      ZenzaWatch.emitter.emitAsync('loadVideoInfo', videoInfo, type);
    },
    _onCommentLoaderLoad: function(xmlText) {
      console.timeEnd('CommentLoader');
      this._nicoVideoPlayer.setComment(xmlText);
    },
    close: function() {
      this.hide();
      if (this._nicoVideoPlayer) {
        this._nicoVideoPlayer.close();
      }
      if (this._onVideoInfoLoaderLoad_proxy) {
        VideoInfoLoader.off('load', this._onVideoInfoLoaderLoad_proxy);
        CommentLoader  .off('load', this._onCommentLoaderLoad_proxy);
        this._onVideoInfoLoaderLoad_proxy = null;
        this._onCommentLoaderLoad_proxy = null;
      }
    }
  });







    var initialize = function() {
      console.log('%cinitialize ZenzaWatch...', 'background: lightgreen; ');
      addStyle(__css__);

      if (!ZenzaWatch.util.isPremium() && !Config.getValue('forceEnable')) {
        return;
      }

      console.time('createOffscreenLayer');
      NicoComment.offScreenLayer.get().then(function(offScreenLayer) {
        console.timeEnd('createOffscreenLayer');
        // コメントの位置計算用のレイヤーが必要
        // スマートじゃないので改善したい


        // watchページか？
        if (location.href.match('\/www.nicovideo.jp\/watch\/')) {
          if (isLogin()) {
            var dialog = initializeDialogPlayer(Config, offScreenLayer);
            if (!hasFlashPlayer()) {
              initializeGinzaSlayer(dialog);
            }
          } else {
          // 非ログイン画面用プレイヤーをセットアップ
            initializeNoLoginWatchPagePlayer(Config, offScreenLayer);
            //var dialog = initializeDialogPlayer(Config, offScreenLayer);
            //dialog.open(getWatchId())
          }
        } else {
          initializeDialogPlayer(Config, offScreenLayer);
        }

      });

    };

    // 非ログイン状態のwatchページ用のプレイヤー生成
    var initializeNoLoginWatchPagePlayer = function(conf, offScreenLayer) {
      addStyle(__no_login_watch_css__);
      var nicoVideoPlayer = new NicoVideoPlayer({
        offScreenLayer: offScreenLayer,
        node: '.logout-video-thumb-box',
        volume:       conf.getValue('volume'),
        loop:         conf.getValue('loop'),
        playerConfig: conf
      });

      VideoInfoLoader.on('load', function(videoInfo, type) {
        console.timeEnd('VideoInfoLoader');
        console.log('VideoInfoLoader.load!', videoInfo, type);

        nicoVideoPlayer.setThumbnail(videoInfo.thumbImage);
        nicoVideoPlayer.setVideo(videoInfo.url);

        console.time('CommentLoader');
        CommentLoader.load(videoInfo.ms, videoInfo.thread_id, videoInfo.l);
      });

      CommentLoader.on('load', function(xmlText) {
        console.timeEnd('CommentLoader');
        nicoVideoPlayer.setComment(xmlText);
      });

      console.time('VideoInfoLoader');
      VideoInfoLoader.load(getWatchId());
    };

    var initializeDialogPlayer = function(conf, offScreenLayer) {
      var dialog = initializeDialog(conf, offScreenLayer);
      initializeHoverMenu(dialog);
      return dialog;
    };

    var initializeGinzaSlayer = function(dialog) {
      $('.notify_update_flash_player').remove();

      dialog.open(getWatchId());
    };


    var initializeHoverMenu = function(dialog) {
      var $menu = $([
      '<div class="zenzaWatchHoverMenu">',
        '<span>Zen</span>',
      '</div>'].join(''));

      var hoverElement = null;

      var onHover = function(e) {
        hoverElement = e.target;
      };

      var onMouseout = function(e) {
        if (e.target === hoverElement) {
          hoverElement = null;
        }
      };

      var onHoverEnd = function(e) {
        if (e.target !== hoverElement) { return; }
        var $target = $(e.target).closest('a');
        var href = $target.attr('data-href') || $target.attr('href');
        var watchId = getWatchId(href);
        var offset = $target.offset();
//        var bottom = offset.top  + $target.outerHeight();
//        var right  = offset.left + $target.outerWidth();

        if (!watchId.match(/^[a-z0-9]+$/)) { return; }
        $('.zenzaWatching').removeClass('zenzaWatching');
        $target.addClass('.zenzaWatching');
        $menu
          .attr({
            'data-watch-id': watchId
          })
          .css({
            top:  offset.top, //  - $menu.outerHeight(),
            left: offset.left - $menu.outerWidth()  / 2
          })
          .addClass('show');
      };

      var onMenuClick = function(e) {
        var $target = $(e.target);
        var watchId = $target.closest('.zenzaWatchHoverMenu').attr('data-watch-id');
        console.log('open: ', watchId);
        dialog.open(watchId);
      };

      $menu.on('click', onMenuClick);

      $('body')
        .on('mouseover', 'a[href*="watch/"]', onHover)
        .on('mouseover', 'a[href*="watch/"]', _.debounce(onHoverEnd, 500))
        .on('mouseout',  'a[href*="watch/"]', onMouseout)
        .on('click', function() { $menu.removeClass('show'); })
        .append($menu);
    };

    var initializeDialog = function(conf, offScreenLayer) {
      console.log('initializeDialog');
      var dialog = new NicoVideoPlayerDialog({
        offScreenLayer: offScreenLayer,
        playerConfig: conf
      });

      return dialog;
    };


    if (window.name !== 'commentLayerFrame') {
      initialize();
    }


}; // end of monkey

//==================================================
//==================================================
//==================================================

  var xmlHttpRequest = function(options) {
    try {
      var req = new XMLHttpRequest();
      var method = options.method || 'GET';
      req.onreadystatechange = function() {
        if (req.readyState === 4) {
          if (typeof options.onload === "function") options.onload(req);
        }
      };
      req.open(method, options.url, true);
      if (options.headers) {
        for (var h in options.headers) {
          req.setRequestHeader(h, options.headers[h]);
        }
      }

      req.send(options.data || null);
    } catch (e) {
      console.error(e);
    }
  };

  var postMessage = function(type, message) {
//    var origin  = 'http://' + location.host.replace(/^.*?\./, 'www.');
    var origin = document.referrer;
    try {
      parent.postMessage(JSON.stringify({
          id: 'NicoCommentLayer',
          type: type, // '',
          body: {
            url: location.href,
            message: message
          }
        }),
        origin);
    } catch (e) {
      alert(e);
      console.log('err', e);
    }
  };

  var parseQuery = function(query) {
    var result = {};
    query.split('&').forEach(function(item) {
      var sp = item.split('=');
      var key = sp[0];
      var val = decodeURIComponent(sp.slice(1).join('='));
      result[key] = val;
    });
    return result;
  };

   // クロスドメインでのvideoInfoLoader情報の通信用
  var exApi = function() {
    if (window.name.indexOf('videoInfoLoaderLoader') < 0 ) { return; }
    console.log('%cexec exApi', 'background: lightgreen;');

    var body  = document.documentElement.textContent;
    var tmp = body.split('var player = new Nicovideo.MiniPlayer(video,')[1];
    tmp = tmp.split(", '', '');")[0];

    var videoInfo = {};
    var parseReg = /'(.*?)': * '(.*?)'/;
    tmp.split(/\n/).forEach(function(line) {
      if(parseReg.test(line)) {
        var key = RegExp.$1;
        var val = decodeURIComponent(RegExp.$2);
        console.log('%cvideoInfo.%s = %s', 'color: #008;', key, val);
        videoInfo[key] = val;
      }
    });

    // HTML5ではmp4以外再生できないのでフォールバック
    var eco = videoInfo.movie_type === 'mp4' ? '' : '&eco=1';
    
    if (!videoInfo.thumbPlayKey) {
      console.log('%cthumbPlayKey not found', 'background: red;');
    }
    var url = 'http://ext.nicovideo.jp/thumb_watch?v=' + videoInfo.v + '&k=' + videoInfo.thumbPlayKey + eco;
    xmlHttpRequest({
      url: url,
      onload: function(req) {
        var result = parseQuery(req.responseText);
        result.thumbImage = videoInfo.thumbImage || '';
        postMessage('videoInfoLoader', result);
      }
    });
  };


  var host = window.location.host || '';
  if (host === 'ext.nicovideo.jp' && window.name.indexOf('videoInfoLoaderLoader') >= 0) {
    exApi();
  } else {
    var script = document.createElement('script');
    script.id = 'ZenzaWatchLoader';
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('charset', 'UTF-8');
    script.appendChild(document.createTextNode( '(' + monkey + ')();' ));
    document.body.appendChild(script);
  }
})();
