import { getGameDomRefs } from './domRefs.js';
import { createBoardController } from '../logic/boardLogic.js';

export function initializeGame() {
    const dom = getGameDomRefs();
    const game = createBoardController(dom);
    const Board = game.board;
    const pieces = game.pieces;
    const tiles = game.tiles;

    // Blueprint order for implementation:
    // Step 1: Implement setSaveStatus.
    // Step 2: Implement persistState.
    // Step 3: Implement fetchSavedState.
    // Step 4: Implement syncPlayModeControls.
    // Step 5: Implement syncControlsFromBoardState.
    // Step 6: Implement CPU-related control listeners.
    // Step 7: Implement save button flow.
    // Step 8: Implement resume button flow.
    // Step 9: Implement reset flow.
    // Step 10: Implement tile click move flow.

    function clearSelectedPieces() {
      document.querySelectorAll('.piece').forEach(function (pieceEl) {
        pieceEl.classList.remove('selected');
      });
    }

    game.setClearSelectedPiecesHandler(clearSelectedPieces);

    function setSaveStatus(message, isError) {
      if (!dom.saveStatus) return;
      dom.saveStatus.textContent = message;
      dom.saveStatus.style.color = isError ? 'red' : 'green';
    }

    async function persistState(state) {
      const response = await fetch('/api/checkers/2d/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state })
      });

      if (!response.ok) {
        throw new Error(`Failed to save game state: ${response.status}`);
      }
      return response.json();
    }

    async function fetchSavedState() {
      const response = await fetch('/api/checkers/2d/save');
      if (response.status === 404) return null;
      if(!response.ok) {
        throw new Error(`Load request failed... status:${response.status}`);
      }
      const payload = await response.json();
      return payload && payload.state ? payload.state : null;
    }

    function syncPlayModeControls() {
      const twoPlayerMode = dom.cpuToggle ? dom.cpuToggle.checked : false;
      Board.cpuEnabled = !twoPlayerMode;
      if (dom.cpuDifficultySelect) {
        dom.cpuDifficultySelect.disabled = twoPlayerMode;
      }
    }

    function syncControlsFromBoardState() {
      if (dom.cpuToggle) {
        dom.cpuToggle.checked =! Board.cpuEnabled;
      }
      if (dom.cpuDifficultySelect) {
       dom.cpuDifficultySelect.value = Board.cpuDifficulty;
       dom.cpuDifficultySelect.disabled = !Board.cpuEnabled
      }
      if (dom.animationToggle) {
       dom.animationToggle.checked = Board.showCpuAnimation;
      }
    }

    Board.initalize();
    Board.check_if_jump_exist();
    Board.updateTurnIndicator();

    if (dom.cpuToggle) {
      syncPlayModeControls();
      dom.cpuToggle.addEventListener('change', function () {
        syncPlayModeControls();
        if (Board.playerTurn === 2){
            Board.scheduleCpuMove();
        }
      });
    }

    if (dom.cpuDifficultySelect) {
      dom.cpuDifficultySelect.value = Board.cpuDifficulty;
      dom.cpuDifficultySelect.addEventListener('change', function (event) {
        Board.cpuDifficulty = event.target.value === 'hard' ? 'hard' : 'easy';
        if (Board.playerTurn === 2) {
          Board.scheduleCpuMove();
        }
      });
    }

    if (dom.animationToggle) {
      Board.showCpuAnimation = dom.animationToggle.checked;
      dom.animationToggle.addEventListener('change', function (event) {
        Board.showCpuAnimation = event.target.checked;
      });
    }

    if (dom.saveButton) {
      dom.saveButton.addEventListener('click', async function () {
        try {
            const state = Board.buildSerializableState();
            const persisted = await persistState(state);
            const persistedAt = persisted && persisted.savedAt ? persisted.savedAt : state.savedAt;
            const savedDate = new Date(persistedAt).toLocaleString();
            setSaveStatus(`saved at ${savedDate}`, false);
        } catch (error) {
            console.error('Error saving game state:', error);
            setSaveStatus(`Error saving game`, true);
        }
      });
    }

    if (dom.resumeButton) {
      dom.resumeButton.addEventListener('click', async function () {
        try {
            const savedState = await fetchSavedState();
            if (!savedState) {
                setSaveStatus('No saved game found.', true);
                return;
            }
            const wasApplied = Board.applySerializedState(savedState);
            if (!wasApplied) {
                setSaveStatus('Failed to apply saved game state.', true);
                return;
            }
            syncControlsFromBoardState();
            const savedDate = savedState.savedAt ? new Date(savedState.savedAt).toLocaleString() : 'unknown time';
            setSaveStatus(`resumed from ${savedDate}`, false);
        } catch (error) {
            console.error('Error resuming game state:', error);
            setSaveStatus(`Error resuming game`, true);
        }
      });
    }

    if (dom.clearButton) {
      dom.clearButton.addEventListener('click', function () {
        Board.clear();
        Board.initalize();
      });
    }

    document.addEventListener('click', function (event) {
      const pieceEl = event.target.closest('.piece');
      //ignoring non-piece clicks
      if (!pieceEl) return;

      if (Board.cpuEnabled && Board.playerTurn == 2) return;

      let selected = false;
      const parentClass = pieceEl.parentElement.className.split(' ')[0];
      const isPlayersTurn = parentClass == 'player' + Board.playerTurn + 'pieces';
      if (isPlayersTurn) {
        if (!Board.continuousjump && pieces[pieceEl.id].allowedtomove) {
          if (pieceEl.classList.contains('selected')) selected = true;// this allows the user to click again to deselect piece chosen
          clearSelectedPieces();
          if (!selected) {
            pieceEl.classList.add('selected');
          }
        } else {
          const exist = 'jump exist for other pieces, that piece is not allowed to move';
          const continuous = 'continuous jump exist, you have to jump the same piece';
          const message = !Board.continuousjump ? exist : continuous;
          console.log(message);
        }
      }
    });

    document.addEventListener('click', function (event) {
     const tileEl = event.target.closest('.tile');
     if(!tileEl) return;
     
     if (Board.cpuEnabled && Board.playerTurn == 2) return;
     
     const selectedElement = document.querySelector('.selected');
     if (!selectedElement) return;
     
     const tileID = tileEl.id.replace('tile', '');
    //  console.log('Tile clicked:', tileID);
     const tile = tiles[tileID];
     const piece = pieces[selectedElement.id];

     const inRange = tile.inRange(piece);
     console.log(inRange);
     
     if(inRange === 'wrong') return;

     if(inRange === 'jump') {

        if(piece.opponentJump(tile)) {
            piece.move(tile);
            if(piece.canJumpAny()) {
                piece.element.classList.add('selected');
                Board.continuousjump = true;
            } else {
                Board.changePlayerTurn();
            }
        }
     } else if(inRange === 'regular') {
        if(!piece.canJumpAny()) {
            piece.move(tile);
            Board.changePlayerTurn();
        } else {
            alert('You must jump if a jump is available!');
        }
     } 

    })
    

}
