// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const games = {};

// Funkcija za sačuvanje stanja igre
const saveGameState = () => {
  try {
    fs.writeFileSync('game_state.json', JSON.stringify(games));
  } catch (err) {
    console.error('Greška pri čuvanju stanja igre:', err);
  }
};

// Funkcija za učitavanje stanja igre
const loadGameState = () => {
  try {
    if (fs.existsSync('game_state.json')) {
      const data = fs.readFileSync('game_state.json', 'utf8');
      Object.assign(games, JSON.parse(data));
      console.log('Stanje igre učitano');
    }
  } catch (err) {
    console.error('Greška pri učitavanju stanja igre:', err);
  }
};

// Pokušaj učitavanja stanja igre prilikom pokretanja servera
loadGameState();

// Čuvanje stanja igre u redovnim intervalima
setInterval(saveGameState, 30000); // Sačuvaj stanje svakih 30 sekundi

io.on('connection', (socket) => {
  console.log('Novi korisnik je povezan:', socket.id);

  // Kreiranje nove igre
  socket.on('createGame', ({ playerName }) => {
    const gameId = generateGameId();
    games[gameId] = {
      gameId,
      players: [{
        id: socket.id,
        name: playerName,
        score: 0
      }],
      word: '',
      guessedLetters: [],
      incorrectGuesses: 0,
      status: 'waiting',
      currentTurn: null,
      currentRound: 1
    };

    socket.join(gameId);
    socket.emit('gameCreated', { gameId });
    console.log('Igra kreirana:', gameId, 'Igrač:', playerName);
  });

  // Pridruživanje postojećoj igri
  socket.on('joinGame', ({ gameId, playerName }) => {
    if (!games[gameId]) {
      socket.emit('error', { message: 'Igra nije pronađena!' });
      return;
    }

    const game = games[gameId];
    
    // Provera da li je ovo isti igrač koji se ponovo povezuje
    const existingPlayerIndex = game.players.findIndex(p => p.name === playerName);
    
    if (existingPlayerIndex !== -1) {
      // Igrač se ponovo povezuje - ažuriramo ID
      game.players[existingPlayerIndex].id = socket.id;
      socket.join(gameId);
      
      // Slanje trenutnog stanja igre igraču koji se ponovo povezao
      socket.emit('rejoinGame', {
        game: {
          status: game.status,
          players: game.players,
          currentRound: game.currentRound,
          maskedWord: game.maskedWord ? game.maskedWord.join(' ') : '',
          guessedLetters: game.guessedLetters,
          incorrectGuesses: game.incorrectGuesses
        },
        playerIndex: existingPlayerIndex
      });
      
      console.log('Igrač se ponovo povezao:', playerName, 'u igri:', gameId);
      return;
    }
    
    // Novi igrač se pridružuje
    if (game.players.length >= 2) {
      socket.emit('error', { message: 'Igra je već puna!' });
      return;
    }

    game.players.push({
      id: socket.id,
      name: playerName,
      score: 0
    });
    
    socket.join(gameId);
    
    io.to(gameId).emit('playerJoined', {
      players: game.players,
      currentRound: game.currentRound
    });
    
    console.log('Igrač se pridružio igri:', gameId, 'Igrač:', playerName);
    
    // Ako su oba igrača tu, počinjemo igru
    if (game.players.length === 2) {
      game.status = 'settingWord';
      game.currentTurn = 0; // Prvi igrač zadaje reč
      io.to(game.players[0].id).emit('setWord');
      io.to(game.players[1].id).emit('waitingForWord');
    }
  });

  // Prvi igrač zadaje reč
  socket.on('setWord', ({ gameId, word }) => {
    const game = games[gameId];
    
    if (!game) return;
    
    // Dobijamo indeks igrača
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    // Provera da li je pošiljalac na redu za zadavanje reči
    if (game.currentTurn !== playerIndex) return;
    
    game.word = word.toLowerCase();
    game.maskedWord = Array(word.length).fill('_');
    game.guessedLetters = [];
    game.incorrectGuesses = 0;
    game.status = 'playing';
    game.currentTurn = (playerIndex + 1) % 2; // Drugi igrač pogađa
    
    const guesserIndex = (playerIndex + 1) % 2;
    
    io.to(game.players[playerIndex].id).emit('wordSet', { 
      maskedWord: game.maskedWord.join(' ').toUpperCase(),
      players: game.players,
      currentRound: game.currentRound
    });
    
    io.to(game.players[guesserIndex].id).emit('startGuessing', { 
      maskedWord: game.maskedWord.join(' ').toUpperCase(),
      players: game.players,
      currentRound: game.currentRound 
    });
    
    saveGameState();
  });

  // Drugi igrač pogađa slovo ili reč
  socket.on('makeGuess', ({ gameId, guess }) => {
    const game = games[gameId];
    
    if (!game || game.status !== 'playing') return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || game.currentTurn !== playerIndex) return;
    
    guess = guess.toLowerCase();
    
    // Pogađanje cele reči
    if (guess.length > 1) {
      if (guess === game.word) {
        // Igrač je pogodio reč
        game.players[playerIndex].score += 1;
        game.status = 'finished';
        game.currentRound += 1;
        
        // Pobednik zadaje sledeću reč
        const nextWordSetterIndex = playerIndex;
        game.currentTurn = nextWordSetterIndex;
        
        io.to(gameId).emit('gameOver', { 
          winner: playerIndex,
          word: game.word.toUpperCase(),
          message: `${game.players[playerIndex].name} je pogodio reč!`,
          players: game.players
        });
      } else {
        game.incorrectGuesses++;
        io.to(gameId).emit('incorrectGuess', { 
          incorrectGuesses: game.incorrectGuesses,
          message: `Netačno! Reč "${guess}" nije tačna.`
        });
        
        // Provera da li je igra završena
        if (game.incorrectGuesses >= 6) {
          // Igrač koji je zadao reč dobija poen
          const wordSetterIndex = (playerIndex + 1) % 2;
          game.players[wordSetterIndex].score += 1;
          game.status = 'finished';
          game.currentRound += 1;
          
          // Pobednik zadaje sledeću reč
          game.currentTurn = wordSetterIndex;
          
          io.to(gameId).emit('gameOver', { 
            winner: wordSetterIndex,
            word: game.word.toUpperCase(),
            message: `${game.players[playerIndex].name} nije uspeo da pogodi reč!`,
            players: game.players
          });
        }
      }
      
      saveGameState();
      return;
    }
    
    // Pogađanje slova
    if (guess.length === 1) {
      if (game.guessedLetters.includes(guess)) {
        socket.emit('error', { message: 'Ovo slovo je već pogađano!' });
        return;
      }
      
      game.guessedLetters.push(guess);
      
      let letterFound = false;
      for (let i = 0; i < game.word.length; i++) {
        if (game.word[i] === guess) {
          game.maskedWord[i] = guess;
          letterFound = true;
        }
      }
      
      if (letterFound) {
        io.to(gameId).emit('correctGuess', { 
          maskedWord: game.maskedWord.join(' ').toUpperCase(),
          guessedLetters: game.guessedLetters.map(letter => letter.toUpperCase())
        });
        
        // Provera da li je reč u potpunosti pogođena
        if (!game.maskedWord.includes('_')) {
          // Igrač koji pogađa dobija poen
          game.players[playerIndex].score += 1;
          game.status = 'finished';
          game.currentRound += 1;
          
          // Pobednik zadaje sledeću reč
          game.currentTurn = playerIndex;
          
          io.to(gameId).emit('gameOver', { 
            winner: playerIndex,
            word: game.word.toUpperCase(),
            message: `${game.players[playerIndex].name} je pogodio reč!`,
            players: game.players
          });
        }
      } else {
        game.incorrectGuesses++;
        io.to(gameId).emit('incorrectGuess', { 
          maskedWord: game.maskedWord.join(' ').toUpperCase(),
          guessedLetters: game.guessedLetters.map(letter => letter.toUpperCase()),
          incorrectGuesses: game.incorrectGuesses 
        });
        
        // Provera da li je igra završena
        if (game.incorrectGuesses >= 6) {
          // Igrač koji je zadao reč dobija poen
          const wordSetterIndex = (playerIndex + 1) % 2;
          game.players[wordSetterIndex].score += 1;
          game.status = 'finished';
          game.currentRound += 1;
          
          // Pobednik zadaje sledeću reč
          game.currentTurn = wordSetterIndex;
          
          io.to(gameId).emit('gameOver', { 
            winner: wordSetterIndex,
            word: game.word.toUpperCase(),
            message: `${game.players[playerIndex].name} nije uspeo da pogodi reč!`,
            players: game.players
          });
        }
      }
      
      saveGameState();
    }
  });

  // Ponovno pokretanje igre
  socket.on('restartGame', ({ gameId }) => {
    const game = games[gameId];
    
    if (!game) return;
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    if (game.status !== 'finished') return;
    
    game.word = '';
    game.guessedLetters = [];
    game.incorrectGuesses = 0;
    game.status = 'settingWord';
    
    // Igrač koji je pobedio postavlja novu reč
    io.to(game.players[game.currentTurn].id).emit('setWord');
    io.to(game.players[(game.currentTurn + 1) % 2].id).emit('waitingForWord');
    
    saveGameState();
  });

  // Prekid veze
  socket.on('disconnect', () => {
    console.log('Korisnik je isključen:', socket.id);
    
    // NE brišemo igre kad se igrač diskonektuje, tako da se može vratiti
    // samo obeležavamo da je igrač trenutno neaktivan
    for (const gameId in games) {
      const game = games[gameId];
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        console.log(`Igrač ${game.players[playerIndex].name} je privremeno isključen iz igre ${gameId}`);
        // Obaveštavamo drugog igrača da je protivnik diskonektovan
        const otherPlayerIndex = (playerIndex + 1) % 2;
        if (game.players[otherPlayerIndex] && game.players[otherPlayerIndex].id) {
          io.to(game.players[otherPlayerIndex].id).emit('opponentDisconnected', {
            playerName: game.players[playerIndex].name
          });
        }
      }
    }
    
    saveGameState();
  });
});

// Generisanje ID-a igre
function generateGameId() {
  return Math.random().toString(36).substring(2, 8);
}

// Pokretanje servera
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server je pokrenut na portu ${PORT}`);
});
