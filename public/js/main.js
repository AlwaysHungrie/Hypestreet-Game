/**
 * Retro top-down racing: car at bottom, traffic falls down (illusion of driving).
 * Steering = smooth left/right (arrow keys or tap toward position). Same Starknet hooks.
 */
var debugmode = false;

var states = Object.freeze({
   SplashScreen: 0,
   GameScreen: 1,
   ScoreScreen: 2
});

var currentstate;

var playerX = 200;   /* continuous horizontal position (px from left) */
var targetX = 200;  /* target for smooth steering */
var roadArea = 420;
var roadWidth = 400;
var score = 0;
var highscore = 0;
var trafficHeight = 56;
var trafficRows = [];
var replayclickable = false;
var NUM_LANES = 2;
var LANE_WIDTH = 0;
var PLAYER_WIDTH = 34;
var PLAYER_HEIGHT = 44;
var STEER_STEP = 42;       /* pixels per left/right input */
var ROAD_MARGIN = 14;       /* min distance from road edge */
var STEER_SPEED = 0.22;    /* lerp factor per frame (smoother = lower) */
var COLLISION_INSET = 4;   /* shrink hitboxes by this many px for less harsh collisions */

var loopGameloop;
var loopTrafficLoop;

var volume = 30;
var soundJump, soundScore, soundHit, soundDie, soundSwoosh;
try {
   if (typeof buzz !== "undefined") {
      soundJump = new buzz.sound("/assets/sounds/sfx_wing.ogg");
      soundScore = new buzz.sound("/assets/sounds/sfx_point.ogg");
      soundHit = new buzz.sound("/assets/sounds/sfx_hit.ogg");
      soundDie = new buzz.sound("/assets/sounds/sfx_die.ogg");
      soundSwoosh = new buzz.sound("/assets/sounds/sfx_swooshing.ogg");
      buzz.all().setVolume(volume);
   }
} catch (e) { /* sounds optional */ }
function playSound(snd) { try { if (snd && snd.play) snd.play(); } catch (e) {} }
function stopSound(snd) { try { if (snd && snd.stop) snd.stop(); } catch (e) {} }

$(document).ready(function() {
   if (window.location.search == "?debug") debugmode = true;
   var savedscore = getCookie("highscore");
   if (savedscore != "") highscore = parseInt(savedscore);
   showSplash();
   $(window).on("load", function() { refreshRoadSize(); clampPlayerX(); $("#player").css({ left: playerX + "px", bottom: "20px", top: "auto" }); });
   $(window).on("resize", function() {
      refreshRoadSize();
      clampPlayerX();
      if (currentstate === states.GameScreen || currentstate === states.SplashScreen)
         $("#player").css({ left: playerX + "px" });
   });
});

function getCookie(cname) {
   var name = cname + "=";
   var ca = document.cookie.split(';');
   for (var i = 0; i < ca.length; i++) {
      var c = ca[i].trim();
      if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
   }
   return "";
}

function setCookie(cname, cvalue, exdays) {
   var d = new Date();
   d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
   document.cookie = cname + "=" + cvalue + "; " + "expires=" + d.toGMTString();
}

function refreshRoadSize() {
   var $fly = $("#flyarea");
   roadArea = $fly.height();
   roadWidth = $fly.width();
   if (roadWidth <= 0 || roadArea <= 0) {
      roadWidth = $fly[0] ? $fly[0].offsetWidth || window.innerWidth : window.innerWidth;
      roadArea = $fly[0] ? $fly[0].offsetHeight || window.innerHeight : window.innerHeight;
   }
   if (roadWidth <= 0) roadWidth = window.innerWidth || 400;
   if (roadArea <= 0) roadArea = window.innerHeight || 420;
   if (roadWidth > 0) LANE_WIDTH = roadWidth / NUM_LANES;
}

function clampPlayerX() {
   var minX = ROAD_MARGIN;
   var maxX = roadWidth - ROAD_MARGIN - PLAYER_WIDTH;
   if (maxX < minX) maxX = minX;
   if (playerX < minX) playerX = minX;
   if (playerX > maxX) playerX = maxX;
   if (targetX < minX) targetX = minX;
   if (targetX > maxX) targetX = maxX;
}

function showSplash() {
   currentstate = states.SplashScreen;
   score = 0;
   refreshRoadSize();
   playerX = roadWidth / 2 - PLAYER_WIDTH / 2;
   targetX = playerX;
   clampPlayerX();
   $("#player").css({ left: playerX + "px", bottom: "20px", top: "auto" });
   $(".traffic-row").remove();
   trafficRows = [];
   $("#splash").transition({ opacity: 1 }, 2000, 'ease');
}

function startGame() {
   if (window.__starknetOnStart) window.__starknetOnStart();
   currentstate = states.GameScreen;
   refreshRoadSize();
   $("#splash").stop();
   $("#splash").transition({ opacity: 0 }, 500, 'ease');
   setBigScore();
   if (debugmode) $(".boundingbox").show();
   loopGameloop = setInterval(gameloop, 1000 / 60);
   loopTrafficLoop = setInterval(updateTraffic, 700);
   updateTraffic(); /* spawn first traffic row immediately */
}

function gameloop() {
   var $fly = $("#flyarea");
   var $player = $("#player");
   refreshRoadSize();
   clampPlayerX();

   /* Smooth steering: lerp toward target */
   var dx = targetX - playerX;
   if (Math.abs(dx) > 0.5) {
      playerX += dx * STEER_SPEED;
      clampPlayerX();
   }
   $player.css({ left: playerX + "px" });

   var playerLeft = playerX;
   var playerTop = roadArea - 20 - PLAYER_HEIGHT;
   var playerBottom = roadArea - 20;

   /* Collision box with small inset for smoother feel */
   var pLeft = playerLeft + COLLISION_INSET;
   var pRight = playerLeft + PLAYER_WIDTH - COLLISION_INSET;
   var pTop = playerTop + COLLISION_INSET;
   var pBottom = playerBottom - COLLISION_INSET;

   if (debugmode) {
      $("#playerbox").css({
         left: $fly.offset().left + playerLeft,
         top: playerTop + $fly.offset().top,
         width: PLAYER_WIDTH,
         height: PLAYER_HEIGHT
      });
   }

   var i = 0;
   while (i < trafficRows.length) {
      var row = trafficRows[i];
      var rowTop = row.offset().top - $fly.offset().top;
      var rowBottom = rowTop + trafficHeight;

      if (rowTop > roadArea + 30) {
         row.remove();
         trafficRows.splice(i, 1);
         continue;
      }

      /* Score once when row has passed the player; keep row so it can fall completely off */
      if (rowBottom < playerTop - 5 && rowTop > 0 && !row.attr("data-scored")) {
         row.attr("data-scored", "1");
         playerScore();
      }

      var overlapY = rowBottom > pTop && rowTop < pBottom;
      if (overlapY) {
         var hit = false;
         row.find(".traffic-car").each(function() {
            var car = $(this)[0];
            var carLeft = car.getBoundingClientRect().left - $fly[0].getBoundingClientRect().left;
            var carTop = car.getBoundingClientRect().top - $fly[0].getBoundingClientRect().top;
            var carRight = carLeft + car.offsetWidth;
            var carBottom = carTop + car.offsetHeight;
            var cLeft = carLeft + COLLISION_INSET;
            var cRight = carRight - COLLISION_INSET;
            var cTop = carTop + COLLISION_INSET;
            var cBottom = carBottom - COLLISION_INSET;
            if (pRight > cLeft && pLeft < cRight && pBottom > cTop && pTop < cBottom) {
               hit = true;
            }
         });
         if (hit) {
            playerDead();
            return;
         }
      }
      i++;
   }
}

$(document).keydown(function(e) {
   if (e.keyCode == 32) {
      e.preventDefault();
      if (currentstate == states.ScoreScreen) $("#replay").click();
      else {
         var inOverlay = document.activeElement && $(document.activeElement).closest("#markets-overlay, #leaderboard-overlay, #controller-overlay").length;
         if (!inOverlay) {
            if (currentstate == states.SplashScreen && typeof window.__starknetOpenMarkets === "function") window.__starknetOpenMarkets();
            else if (currentstate != states.SplashScreen) screenClick();
         }
      }
      return;
   }
   if (currentstate !== states.GameScreen) return;
   if (e.keyCode == 37) {
      e.preventDefault();
      targetX -= STEER_STEP;
      if (targetX < ROAD_MARGIN) targetX = ROAD_MARGIN;
      if (targetX > roadWidth - ROAD_MARGIN - PLAYER_WIDTH) targetX = roadWidth - ROAD_MARGIN - PLAYER_WIDTH;
      stopSound(soundJump);
      playSound(soundJump);
   } else if (e.keyCode == 39) {
      e.preventDefault();
      targetX += STEER_STEP;
      if (targetX < ROAD_MARGIN) targetX = ROAD_MARGIN;
      if (targetX > roadWidth - ROAD_MARGIN - PLAYER_WIDTH) targetX = roadWidth - ROAD_MARGIN - PLAYER_WIDTH;
      stopSound(soundJump);
      playSound(soundJump);
   }
});

if ("ontouchstart" in window)
   $(document).on("touchstart", screenClick);
else
   $(document).on("mousedown", screenClick);

function screenClick(e) {
   /* Don't start game or steer when clicking inside overlays (Markets, Leaderboard, Controller) */
   if (e && e.target && $(e.target).closest("#markets-overlay, #leaderboard-overlay, #controller-overlay").length)
      return;
   if (currentstate == states.GameScreen) {
      /* Tap: smooth move toward click X, or step right if no position */
      var $fly = $("#flyarea");
      if (e && (e.clientX != null || e.touches)) {
         var x = (e.touches ? e.touches[0].clientX : e.clientX);
         var flyLeft = $fly[0].getBoundingClientRect().left;
         targetX = x - flyLeft - PLAYER_WIDTH / 2;
         if (targetX < ROAD_MARGIN) targetX = ROAD_MARGIN;
         if (targetX > roadWidth - ROAD_MARGIN - PLAYER_WIDTH) targetX = roadWidth - ROAD_MARGIN - PLAYER_WIDTH;
      } else {
         targetX += STEER_STEP;
         if (targetX < ROAD_MARGIN) targetX = ROAD_MARGIN;
         if (targetX > roadWidth - ROAD_MARGIN - PLAYER_WIDTH) targetX = roadWidth - ROAD_MARGIN - PLAYER_WIDTH;
      }
      stopSound(soundJump);
      playSound(soundJump);
   } else if (currentstate == states.SplashScreen) {
      if (typeof window.__starknetOpenMarkets === "function") window.__starknetOpenMarkets();
   }
}

function setBigScore(erase) {
   var el = $("#bigscore");
   el.empty();
   if (erase) return;
   var digits = score.toString().split('');
   for (var i = 0; i < digits.length; i++)
      el.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setSmallScore() {
   $("#currentscore").empty();
   score.toString().split('').forEach(function(d) {
      $("#currentscore").append("<img src='assets/font_small_" + d + ".png' alt='" + d + "'>");
   });
}

function setHighScore() {
   $("#highscore").empty();
   highscore.toString().split('').forEach(function(d) {
      $("#highscore").append("<img src='assets/font_small_" + d + ".png' alt='" + d + "'>");
   });
}

function setMedal() {
   var el = $("#medal");
   el.empty();
   if (score < 10) return false;
   var medal = "bronze";
   if (score >= 20) medal = "silver";
   if (score >= 30) medal = "gold";
   if (score >= 40) medal = "platinum";
   el.append('<img src="assets/medal_' + medal + '.png" alt="' + medal + '">');
   return true;
}

function playerDead() {
   if (window.__starknetOnGameOver) window.__starknetOnGameOver();
   currentstate = states.ScoreScreen;
   clearInterval(loopGameloop);
   clearInterval(loopTrafficLoop);
   loopGameloop = null;
   loopTrafficLoop = null;
   if (isIncompatible.any()) {
      showScore();
   } else {
      try {
         if (soundHit && soundHit.play) soundHit.play().bindOnce("ended", function() {
            if (soundDie && soundDie.play) soundDie.play().bindOnce("ended", function() { showScore(); });
            else showScore();
         }); else showScore();
      } catch (e) { showScore(); }
   }
}

function showScore() {
   if (score > highscore) {
      highscore = score;
      setCookie("highscore", highscore, 999);
   }
   setBigScore(true);
   $("#scoreboard").css("display", "block");
   stopSound(soundSwoosh);
   playSound(soundSwoosh);
   $("#scoreboard").css({ y: '40px', opacity: 0 });
   $("#replay").css({ y: '40px', opacity: 0 });
   $("#scoreboard").transition({ y: '0px', opacity: 1 }, 600, 'ease', function() {
      stopSound(soundSwoosh);
      playSound(soundSwoosh);
      $("#replay").transition({ y: '0px', opacity: 1 }, 600, 'ease');
   });
   replayclickable = true;
}

window.__starknetStartGame = startGame;

$("#replay").click(function() {
   if (!replayclickable) return;
   replayclickable = false;
   stopSound(soundSwoosh);
   playSound(soundSwoosh);
   $("#scoreboard").transition({ y: '-40px', opacity: 0 }, 1000, 'ease', function() {
      $("#scoreboard").css("display", "none");
      showSplash();
   });
});

function playerScore() {
   score += 1;
   stopSound(soundScore);
   playSound(soundScore);
   setBigScore();
   if (window.__starknetOnScore) window.__starknetOnScore();
}

function updateTraffic() {
   refreshRoadSize();
   if (LANE_WIDTH <= 0 && roadWidth > 0) LANE_WIDTH = roadWidth / NUM_LANES;
   if (LANE_WIDTH <= 0) return;

   var gapLane = Math.floor(Math.random() * NUM_LANES);
   var parts = [];
   for (var i = 0; i < NUM_LANES; i++) {
      var isGap = i === gapLane;
      var laneClass = 'traffic-lane' + (isGap ? ' traffic-gap' : '');
      var inner = isGap ? '' : '<div class="traffic-car"></div>';
      parts.push('<div class="' + laneClass + '">' + inner + '</div>');
   }
   var newRow = $('<div class="traffic-row animated" data-gap-lane="' + gapLane + '">' + parts.join('') + '</div>');
   $("#flyarea").append(newRow);
   trafficRows.push(newRow);
}

var isIncompatible = {
   Android: function() { return navigator.userAgent.match(/Android/i); },
   BlackBerry: function() { return navigator.userAgent.match(/BlackBerry/i); },
   iOS: function() { return navigator.userAgent.match(/iPhone|iPad|iPod/i); },
   Opera: function() { return navigator.userAgent.match(/Opera Mini/i); },
   Safari: function() { return (navigator.userAgent.match(/OS X.*Safari/) && !navigator.userAgent.match(/Chrome/)); },
   Windows: function() { return navigator.userAgent.match(/IEMobile/i); },
   any: function() {
      return (isIncompatible.Android() || isIncompatible.BlackBerry() || isIncompatible.iOS() ||
              isIncompatible.Opera() || isIncompatible.Safari() || isIncompatible.Windows());
   }
};
