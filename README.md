# Codex Usage per OpenCode

Plugin TUI locale per OpenCode **1.18.34**, con quota ChatGPT/Codex accanto al prompt.

```text
Codex · 5h: 72% · 7g: 41% rim.
```

Le percentuali sono **rimanenti**, condivise da tutti i client Codex dell'account.
Le finestre sono ricavate dalla risposta del servizio. Sotto 90 colonne compare
la percentuale più bassa tra le finestre. Verde: oltre 25%; giallo: fino al 25%;
rosso: fino al 10%. `*` indica dati precedenti dopo un errore, `…` un aggiornamento.

## Uso

- `/codex-usage`: dettagli, piano, reset nel fuso locale e ultimo aggiornamento.
- `/codex-usage-refresh`: aggiorna e apre i dettagli.
- Un clic sull'indicatore apre i dettagli, se la TUI ha il mouse abilitato.
- Aggiornamento all'avvio, ogni 60s e a fine risposta (massimo uno ogni 15s per gli eventi idle).

## Caricamento

In `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./plugins/codex-usage/index.tsx"]
}
```

Chiudere e riavviare OpenCode dopo le modifiche. Per disabilitare, rimuovere
la voce dal file oppure usare il gestore Plugins nella palette.

## Credenziali e rete

Il plugin legge `openai` da `$XDG_DATA_HOME/opencode/auth.json`, oppure da
`~/.local/share/opencode/auth.json` (anche su Windows). Rispetta anche
`OPENCODE_AUTH_CONTENT`. Serve il login **ChatGPT**, non una chiave API.
Non scrive credenziali e non salva token o quote nei log o nella KV della TUI.

OpenCode resta responsabile del rinnovo OAuth: se il token è scaduto, inviare
un messaggio usando OpenAI per rinnovarlo, oppure ripetere `/connect`.
Il plugin rilegge le credenziali a ogni aggiornamento e riprende automaticamente.
Con una TUI collegata a un server remoto, le credenziali devono essere disponibili
sulla macchina che esegue la TUI.

I dati provengono da `https://chatgpt.com/backend-api/wham/usage`, endpoint interno
usato dal client Codex, la cui struttura può cambiare. Le richieste hanno timeout
di 10s, non seguono redirect e non si sovrappongono. Gli errori non mostrano corpi
HTTP o altri dati sensibili. I dati precedenti sono marcati come non aggiornati.

## Sviluppo

```sh
bun install
bun run typecheck
bun run test
bun run check:live
```

OpenCode fornisce a runtime Solid/OpenTUI e compila il TSX tramite il proprio
loader. Le dipendenze locali servono per sviluppo e verifiche.
I test TUI usano la condizione `browser` di Solid per avere la reattività,
come il runtime Solid fornito da OpenCode.
