require('dotenv').config()
const axios = require('axios')
const hyperquest = require('hyperquest')
const ndjson = require('ndjson')
const { exec } = require('child_process')

const headers = {
    Authorization: `Bearer ${process.env.lichessToken}`,
    Accept: 'application/x-ndjson',
}

const sendChatToGame = (gameId, text) => {
    axios.post(`https://lichess.org/api/bot/game/${gameId}/chat`, {
        room: 'player',
        text,
    }, { headers })
        .catch(err => console.log('error sending chat: ', err))
}

const resignGame = gameId => {
    axios.post(`https://lichess.org/api/bot/game/${gameId}/resign`, {}, { headers })
}

const streamEvents = () => {
    hyperquest(`https://lichess.org/api/stream/event`, { headers })
        .pipe(ndjson.parse())
        .on('data', async data => {
            switch (data.type) {
                case 'gameStart':
                    console.log('gameStart', data)
                    streamGame(data.game.id)
                    break;
                case 'gameFinish':
                    console.log('gameFinish', data)
                    break;
                case 'challenge':
                    console.log('challenge', data)
                    // accept the challenge
                    axios.post(`https://lichess.org/api/challenge/${data.challenge.id}/accept`, {}, { headers })
                    break
                case 'challengeCanceled':
                    console.log('challengeCanceled', data)
                    break
                case 'challengeDeclined':
                    console.log('challengeDeclined', data)
                    break
            }
        })
}

const streamGame = async gameId => {
    
    let color

    hyperquest(`https://lichess.org/api/bot/game/stream/${gameId}`, { headers })
        .pipe(ndjson.parse())
        .on('data', async data => {
            switch (data.type) {
                case 'gameFull':
                    console.log(data)
                    color = data.white.name === 'bobandi' ? 'white' : 'black'
                    const text = `Thanks for the challenge! I love playing the ${color} pieces. Let's get started!`
                    sendChatToGame(gameId, text)

                    // we play 1.e4
                    if (color === 'white' && data.state.moves === '') {
                        axios.post(`https://lichess.org/api/bot/game/${gameId}/move/e2e4`, {}, { headers })
                            .catch(err => {})
                    }

                    break

                case 'gameState':
                    const toPlay = data.moves.split(' ').length % 2 === 0 ? 'white' : 'black'
                    // it's not our turn
                    if (color !== toPlay) {
                        sendChatToGame(gameId, 'Fantastic move!! Let me analyze...')
                        return
                    }
        
                    exec(`./engine/bobandi ${data.moves}`, (error, stdout, stderr) => {
                        if (error) {
                            console.log('Error running bobandi: ', error)
                            sendChatToGame(gameId, 'Sorry, but there was an error when trying to run my engine. This can happen as I am still under early development. Let\'s play again soon!')
                            resignGame(gameId)
                            return
                        }
        
                        if (stderr) {
                            console.log('stderr: ', stderr)
                        }
        
                        const move = stdout
        
                        axios.post(`https://lichess.org/api/bot/game/${gameId}/move/${move}`, {}, { headers })
                            .catch(err => {
                                if (err.response?.status === 400) {
                                    // this is fine, it's just not our turn
                                    if (err.response.data.error === 'Not your turn, or game already over') {
                                        console.log('its fine, its just not our turn!')
                                    }                        
                                    // Our move is not legal, so we must resign the game :(
                                    else {
                                        console.log('Our move was illegal!', err.response.data.error)
                                        sendChatToGame(gameId, 'I\'m out of moves! Remember I am still a very weak player. Let\'s play again soon!')
                                        resignGame(gameId)
                                    }
                                }
                            })
                    })
        
                    break
                case 'chatLine':
                    console.log(data)
                    break
            }
        })
}

streamEvents()

//axios.get('https://lichess.org/api/account', { headers })
//    .then(res => console.log(res.data))
