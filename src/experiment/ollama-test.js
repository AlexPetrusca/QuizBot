import { Ollama } from 'ollama'

const message = { role: 'user', content: 'Why is the sky blue?' }
const ollama = new Ollama({ host: 'localhost:58081' })
const response = await ollama.chat({
	model: 'llama3.2:1b',
	messages: [message],
	stream: true,
})

console.log()
for await (const part of response) {
	process.stdout.write(part.message.content)
}
console.log()
