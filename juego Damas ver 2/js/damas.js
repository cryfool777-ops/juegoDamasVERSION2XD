const SIZE = 8;
const LIGHT = 'light';
const DARK = 'dark';
const TURN_SECONDS = 120;
const STORAGE_KEY = 'damas_saved_games';

let board = [];
let currentPlayer = LIGHT;
let selected = null;
let legalMovesForSelected = [];
let forcedContinuation = null;
let lastMove = null;
let gameOver = false;

let timeLeft = { [LIGHT]: TURN_SECONDS, [DARK]: TURN_SECONDS };
let timerInterval = null;

function isDark(row, col){ return (row + col) % 2 === 1; }

function initBoard(){
  board = Array.from({length: SIZE}, () => Array(SIZE).fill(null));
  for(let row = 0; row < 3; row++){
    for(let col = 0; col < SIZE; col++){
      if(isDark(row, col)) board[row][col] = { color: LIGHT, king: false };
    }
  }
  for(let row = 5; row < 8; row++){
    for(let col = 0; col < SIZE; col++){
      if(isDark(row, col)) board[row][col] = { color: DARK, king: false };
    }
  }
  currentPlayer = LIGHT;
  selected = null;
  legalMovesForSelected = [];
  forcedContinuation = null;
  lastMove = null;
  gameOver = false;
  timeLeft = { [LIGHT]: TURN_SECONDS, [DARK]: TURN_SECONDS };
  startTurnTimer();
}

function inBounds(row, col){ return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }
function forwardDir(color){ return color === LIGHT ? 1 : -1; }

function moveDirections(piece){
  if(piece.king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  const forward = forwardDir(piece.color);
  return [[forward,-1],[forward,1]];
}

const ALL_DIAGONALS = [[-1,-1],[-1,1],[1,-1],[1,1]];

function simpleMoves(row, col){
  const piece = board[row][col];
  const moves = [];
  for(const [rowDirection, colDirection] of moveDirections(piece)){
    const nextRow = row + rowDirection;
    const nextCol = col + colDirection;
    if(inBounds(nextRow, nextCol) && !board[nextRow][nextCol]){
      moves.push({ from:{row, col}, to:{row:nextRow, col:nextCol}, captures:[] });
    }
  }
  return moves;
}

function captureSequences(row, col, boardState, piece, capturedSoFar, origin){
  capturedSoFar = capturedSoFar || [];
  origin = origin || { row, col };
  const results = [];

  for(const [rowDirection, colDirection] of ALL_DIAGONALS){
    const middleRow = row + rowDirection;
    const middleCol = col + colDirection;
    const landingRow = row + rowDirection * 2;
    const landingCol = col + colDirection * 2;
    if(!inBounds(landingRow, landingCol)) continue;

    const middlePiece = boardState[middleRow] && boardState[middleRow][middleCol];
    const landingFree = !boardState[landingRow][landingCol];
    const alreadyCaptured = capturedSoFar.some(
      captured => captured.row === middleRow && captured.col === middleCol
    );

    if(middlePiece && middlePiece.color !== piece.color && landingFree && !alreadyCaptured){
      const newCaptured = capturedSoFar.concat([{row:middleRow, col:middleCol}]);
      const cloned = boardState.map(boardRow => boardRow.slice());
      cloned[row][col] = null;
      cloned[middleRow][middleCol] = null;
      cloned[landingRow][landingCol] = piece;

      const further = captureSequences(landingRow, landingCol, cloned, piece, newCaptured, origin);

      if(further.length === 0){
        results.push({ from: origin, to:{row:landingRow, col:landingCol}, captures:newCaptured });
      }else{
        results.push(...further);
      }
    }
  }
  return results;
}

function allMovesForPlayer(color){
  let allCaptures = [];
  let allSimple = [];

  for(let row = 0; row < SIZE; row++){
    for(let col = 0; col < SIZE; col++){
      const piece = board[row][col];
      if(piece && piece.color === color){
        const captures = captureSequences(row, col, board, piece, []);
        if(captures.length) allCaptures = allCaptures.concat(captures);
        else allSimple = allSimple.concat(simpleMoves(row, col));
      }
    }
  }

  if(allCaptures.length > 0) return { moves: allCaptures, forced: true };
  return { moves: allSimple, forced: false };
}

function movesFromOrigin(row, col){
  const { moves } = allMovesForPlayer(currentPlayer);
  return moves.filter(move => move.from.row === row && move.from.col === col);
}

function applyMove(move){
  const piece = board[move.from.row][move.from.col];
  board[move.from.row][move.from.col] = null;
  for(const captured of move.captures) board[captured.row][captured.col] = null;
  board[move.to.row][move.to.col] = piece;

  if(!piece.king){
    if(piece.color === LIGHT && move.to.row === SIZE - 1) piece.king = true;
    if(piece.color === DARK && move.to.row === 0) piece.king = true;
  }
  lastMove = { from: move.from, to: move.to };
}

function hasFurtherCapture(row, col){
  const piece = board[row][col];
  if(!piece) return false;
  return captureSequences(row, col, board, piece, []).length > 0;
}

function switchTurn(){
  currentPlayer = currentPlayer === LIGHT ? DARK : LIGHT;
  startTurnTimer();
}

function countPieces(color){
  let count = 0;
  for(let row = 0; row < SIZE; row++){
    for(let col = 0; col < SIZE; col++){
      if(board[row][col] && board[row][col].color === color) count++;
    }
  }
  return count;
}

function checkGameEnd(){
  const lightLeft = countPieces(LIGHT);
  const darkLeft = countPieces(DARK);
  if(lightLeft === 0){ endGame(DARK, 'sin_fichas'); return true; }
  if(darkLeft === 0){ endGame(LIGHT, 'sin_fichas'); return true; }

  const { moves } = allMovesForPlayer(currentPlayer);
  if(moves.length === 0){
    const winner = currentPlayer === LIGHT ? DARK : LIGHT;
    endGame(winner, 'bloqueo');
    return true;
  }
  return false;
}

function endGame(winner, reason){
  gameOver = true;
  stopTurnTimer();
  const label = winner === LIGHT ? 'Claras' : 'Rojas';
  const reasonText = reason === 'sin_fichas' ? 'el rival se quedó sin fichas'
    : reason === 'tiempo' ? 'el rival agotó su tiempo de turno'
    : 'el rival no tiene movimientos posibles (acorralado)';
  setStatus(`Ganan las fichas ${label}: ${reasonText}.`, true);
}

// --- Temporizador ---
function startTurnTimer(){
  stopTurnTimer();
  if(gameOver) return;
  timeLeft[currentPlayer] = TURN_SECONDS;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft[currentPlayer]--;
    if(timeLeft[currentPlayer] <= 0){
      timeLeft[currentPlayer] = 0;
      updateTimerDisplay();
      const winner = currentPlayer === LIGHT ? DARK : LIGHT;
      endGame(winner, 'tiempo');
      render();
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

function stopTurnTimer(){
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
}

function formatTime(seconds){
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function updateTimerDisplay(){
  const lightEl = document.getElementById('timer-light');
  const darkEl = document.getElementById('timer-dark');
  const lightBox = document.getElementById('timer-box-light');
  const darkBox = document.getElementById('timer-box-dark');
  if(!lightEl || !darkEl || !lightBox || !darkBox) return;
  lightEl.textContent = formatTime(timeLeft[LIGHT]);
  darkEl.textContent = formatTime(timeLeft[DARK]);
  lightBox.classList.toggle('active', currentPlayer === LIGHT && !gameOver);
  darkBox.classList.toggle('active', currentPlayer === DARK && !gameOver);
  lightBox.classList.toggle('low', timeLeft[LIGHT] <= 20);
  darkBox.classList.toggle('low', timeLeft[DARK] <= 20);
}

// --- Guardar / Cargar / Historial ---
function loadHistory(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function persistHistory(list){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
  catch(e){ /* almacenamiento no disponible */ }
}

function saveGame(){
  const name = prompt('Nombre para esta partida guardada:', `Partida ${new Date().toLocaleString('es-MX')}`);
  if(name === null) return;
  const list = loadHistory();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    name: name.trim() || `Partida ${new Date().toLocaleString('es-MX')}`,
    savedAt: new Date().toISOString(),
    state: {
      board, currentPlayer, lastMove, gameOver,
      timeLeft: { ...timeLeft }
    }
  };
  list.unshift(entry);
  persistHistory(list);
  renderHistory();
  setStatus(`Partida guardada como "${entry.name}".`);
}

function loadGame(id){
  const list = loadHistory();
  const entry = list.find(item => item.id === id);
  if(!entry) return;
  const state = entry.state;
  board = state.board;
  currentPlayer = state.currentPlayer;
  lastMove = state.lastMove;
  gameOver = state.gameOver;
  timeLeft = { [LIGHT]: state.timeLeft[LIGHT], [DARK]: state.timeLeft[DARK] };
  selected = null;
  legalMovesForSelected = [];
  forcedContinuation = null;
  stopTurnTimer();
  if(!gameOver){
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timeLeft[currentPlayer]--;
      if(timeLeft[currentPlayer] <= 0){
        timeLeft[currentPlayer] = 0;
        updateTimerDisplay();
        const winner = currentPlayer === LIGHT ? DARK : LIGHT;
        endGame(winner, 'tiempo');
        render();
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }
  setStatus(`Partida "${entry.name}" cargada.`);
  render();
}

function deleteGame(id){
  const list = loadHistory().filter(item => item.id !== id);
  persistHistory(list);
  renderHistory();
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHistory(){
  const container = document.getElementById('history-list');
  if(!container) return;
  const list = loadHistory();
  container.innerHTML = '';
  if(list.length === 0){
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Todavía no hay partidas guardadas.';
    container.appendChild(empty);
    return;
  }
  for(const entry of list){
    const item = document.createElement('div');
    item.className = 'history-item';

    const info = document.createElement('div');
    info.className = 'info';
    const date = new Date(entry.savedAt);
    const turnLabelText = entry.state.gameOver ? 'finalizada' :
      (entry.state.currentPlayer === LIGHT ? 'turno de claras' : 'turno de rojas');
    info.innerHTML = `<div class="name">${escapeHtml(entry.name)}</div>
      <div class="muted">${date.toLocaleString('es-MX')} · ${turnLabelText}</div>`;

    const btns = document.createElement('div');
    btns.className = 'btns';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Cargar';
    loadBtn.addEventListener('click', () => loadGame(entry.id));
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', () => {
      if(confirm(`¿Eliminar "${entry.name}" del historial?`)) deleteGame(entry.id);
    });
    btns.appendChild(loadBtn);
    btns.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(btns);
    container.appendChild(item);
  }
}

// --- Render e interacción ---
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status-msg');
const turnDot = document.getElementById('turn-dot');
const turnLabel = document.getElementById('turn-label');
const countLightElement = document.getElementById('count-light');
const countDarkElement = document.getElementById('count-dark');

function setStatus(text, isWin){
  statusElement.textContent = text;
  statusElement.classList.toggle('win', !!isWin);
}

function render(){
  boardElement.innerHTML = '';
  const { moves: currentPlayerMoves, forced } = gameOver
    ? { moves: [], forced:false }
    : allMovesForPlayer(currentPlayer);
  const originsWithMoves = new Set(
    currentPlayerMoves.map(move => `${move.from.row},${move.from.col}`)
  );

  for(let row = 0; row < SIZE; row++){
    for(let col = 0; col < SIZE; col++){
      const square = document.createElement('div');
      square.className = 'sq ' + (isDark(row, col) ? 'dark' : 'light');
      square.dataset.row = row;
      square.dataset.col = col;

      if(lastMove && (
        (lastMove.from.row === row && lastMove.from.col === col) ||
        (lastMove.to.row === row && lastMove.to.col === col)
      )) square.classList.add('last-move');

      const piece = board[row][col];
      if(piece){
        const pieceElement = document.createElement('div');
        pieceElement.className = 'piece ' +
          (piece.color === LIGHT ? 'light-piece' : 'dark-piece') +
          (piece.king ? ' king' : '');
        if(!gameOver && piece.color === currentPlayer && originsWithMoves.has(`${row},${col}`)){
          pieceElement.classList.add('movable');
        }
        pieceElement.addEventListener('click', event => {
          event.stopPropagation();
          onSquareClick(row, col);
        });
        square.appendChild(pieceElement);
      }

      if(selected && selected.row === row && selected.col === col){
        square.classList.add('origin');
      }
      if(selected){
        const target = legalMovesForSelected.find(
          move => move.to.row === row && move.to.col === col
        );
        if(target){
          square.classList.add('selectable');
          if(target.captures.length) square.classList.add('capture-hint');
        }
      }

      square.addEventListener('click', () => onSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }

  turnDot.className = 'turn-dot ' + currentPlayer;
  turnLabel.textContent = currentPlayer === LIGHT ? 'Claras' : 'Rojas';
  countLightElement.textContent = countPieces(LIGHT);
  countDarkElement.textContent = countPieces(DARK);
  updateTimerDisplay();

  if(!gameOver){
    if(forced && !forcedContinuation){
      setStatus('Captura obligatoria: solo puedes mover una de las fichas resaltadas.');
    }else if(forcedContinuation){
      setStatus('Debes seguir comiendo con la misma ficha.');
    }else if(!selected){
      setStatus(`Turno de ${currentPlayer === LIGHT ? 'claras' : 'rojas'}. Selecciona una ficha.`);
    }
  }
}

function onSquareClick(row, col){
  if(gameOver) return;

  if(selected){
    const move = legalMovesForSelected.find(
      candidate => candidate.to.row === row && candidate.to.col === col
    );
    if(move){
      applyMove(move);
      const chainContinues = move.captures.length > 0 &&
        hasFurtherCapture(move.to.row, move.to.col);

      if(chainContinues){
        selected = { row: move.to.row, col: move.to.col };
        forcedContinuation = selected;
        legalMovesForSelected = movesFromOrigin(selected.row, selected.col);
        render();
        return;
      }

      selected = null;
      legalMovesForSelected = [];
      forcedContinuation = null;
      switchTurn();
      checkGameEnd();
      render();
      return;
    }
  }

  if(forcedContinuation){
    render();
    return;
  }

  const piece = board[row][col];
  if(piece && piece.color === currentPlayer){
    const moves = movesFromOrigin(row, col);
    if(moves.length === 0){
      selected = null;
      legalMovesForSelected = [];
      render();
      return;
    }
    selected = { row, col };
    legalMovesForSelected = moves;
  }else{
    selected = null;
    legalMovesForSelected = [];
  }
  render();
}

document.getElementById('restart-btn').addEventListener('click', () => {
  initBoard();
  render();
});

document.getElementById('draw-btn').addEventListener('click', () => {
  if(gameOver) return;
  gameOver = true;
  stopTurnTimer();
  setStatus('Partida finalizada por acuerdo entre ambos jugadores.', true);
  render();
});

document.getElementById('save-btn').addEventListener('click', saveGame);

document.getElementById('rules-toggle').addEventListener('click', () => {
  const rulesBox = document.getElementById('rules-box');
  const visible = rulesBox.style.display === 'block';
  rulesBox.style.display = visible ? 'none' : 'block';
  document.getElementById('rules-toggle').textContent = visible
    ? 'Ver reglas del juego'
    : 'Ocultar reglas del juego';
});

initBoard();
render();
renderHistory();
