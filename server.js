// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const games = {};

io.on('connection', (socket) => {
  console.log('Novi korisnik je povezan:', socket.id);

  // Kreiranje nove igre
  socket.on('createGame', () => {
    const gameId = generateGameId();
    games[gameId] = {
      gameId,
      players: [socket.id],
      word: '',
      guessedLetters: [],
      incorrectGuesses: 0,
      status: 'waiting',
      currentTurn: null
    };

    socket.join(gameId);
    socket.emit('gameCreated', { gameId });
    console.log('Igra kreirana:', gameId);
  });

  // Pridruživanje postojećoj igri
  socket.on('joinGame', ({ gameId }) => {
    const game = games[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Igra nije pronađena!' });
      return;
    }

    if (game.players.length >= 2) {
      socket.emit('error', { message: 'Igra je već puna!' });
      return;
    }

    game.players.push(socket.id);
    socket.join(gameId);
    
    io.to(gameId).emit('playerJoined');
    console.log('Igrač se pridružio igri:', gameId);
    
    // Ako su oba igrača tu, počinjemo igru
    if (game.players.length === 2) {
      game.status = 'settingWord';
      game.currentTurn = 0; // Prvi igrač zadaje reč
      io.to(game.players[0]).emit('setWord');
      io.to(game.players[1]).emit('waitingForWord');
    }
  });

  // Prvi igrač zadaje reč
  socket.on('setWord', ({ gameId, word }) => {
    const game = games[gameId];
    
    if (!game) return;
    
    // Provera da li je pošiljalac zaista prvi igrač
    if (socket.id !== game.players[0]) return;
    
    game.word = word.toLowerCase();
    game.maskedWord = Array(word.length).fill('_');
    game.status = 'playing';
    game.currentTurn = 1; // Drugi igrač pogađa
    
    io.to(game.players[0]).emit('wordSet', { 
      maskedWord: game.maskedWord.join(' ')
    });
    
    io.to(game.players[1]).emit('startGuessing', { 
      wordLength: word.length,
      maskedWord: game.maskedWord.join(' ') 
    });
  });

  // Drugi igrač pogađa slovo ili reč
  socket.on('makeGuess', ({ gameId, guess }) => {
    const game = games[gameId];
    
    if (!game || game.status !== 'playing') return;
    if (socket.id !== game.players[1]) return;
    
    guess = guess.toLowerCase();
    
    // Pogađanje cele reči
    if (guess.length > 1) {
      if (guess === game.word) {
        game.status = 'finished';
        io.to(gameId).emit('gameOver', { 
          winner: socket.id,
          word: game.word,
          message: 'Reč je pogođena!' 
        });
      } else {
        game.incorrectGuesses++;
        io.to(gameId).emit('incorrectGuess', { 
          incorrectGuesses: game.incorrectGuesses 
        });
        
        // Provera da li je igra završena
        if (game.incorrectGuesses >= 6) {
          game.status = 'finished';
          io.to(gameId).emit('gameOver', { 
            winner: game.players[0],
            word: game.word,
            message: 'Igrač koji pogađa je izgubio!' 
          });
        }
      }
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
          maskedWord: game.maskedWord.join(' '),
          guessedLetters: game.guessedLetters
        });
        
        // Provera da li je reč u potpunosti pogođena
        if (!game.maskedWord.includes('_')) {
          game.status = 'finished';
          io.to(gameId).emit('gameOver', { 
            winner: socket.id,
            word: game.word,
            message: 'Reč je pogođena!' 
          });
        }
      } else {
        game.incorrectGuesses++;
        io.to(gameId).emit('incorrectGuess', { 
          maskedWord: game.maskedWord.join(' '),
          guessedLetters: game.guessedLetters,
          incorrectGuesses: game.incorrectGuesses 
        });
        
        // Provera da li je igra završena
        if (game.incorrectGuesses >= 6) {
          game.status = 'finished';
          io.to(gameId).emit('gameOver', { 
            winner: game.players[0],
            word: game.word,
            message: 'Igrač koji pogađa je izgubio!' 
          });
        }
      }
    }
  });

  // Ponovno pokretanje igre
  socket.on('restartGame', ({ gameId }) => {
    const game = games[gameId];
    
    if (!game) return;
    
    game.word = '';
    game.guessedLetters = [];
    game.incorrectGuesses = 0;
    game.status = 'settingWord';
    game.currentTurn = 0;
    
    io.to(game.players[0]).emit('setWord');
    io.to(game.players[1]).emit('waitingForWord');
  });

  // Prekid veze
  socket.on('disconnect', () => {
    // Pronalazimo igre u kojima je korisnik učestvovao
    for (const gameId in games) {
      const game = games[gameId];
      
      if (game.players.includes(socket.id)) {
        io.to(gameId).emit('playerDisconnected', { message: 'Drugi igrač se isključio!' });
        delete games[gameId];
      }
    }
    console.log('Korisnik je isključen:', socket.id);
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
