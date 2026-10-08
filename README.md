# Codex Usage per OpenCode

Plugin TUI locale per OpenCode, sviluppato con l'API plugin **1.18.34**.
Mostra la quota rimanente ChatGPT/Codex a destra del prompt, sia nella home
sia nelle conversazioni.

La vista iniziale mostra la quota rimanente della finestra **5h** e il tempo
mancante al reset tra parentesi:

```text
Codex · 5h: 87% (4h 30m)
```

Con un click destro sull'indicatore si apre un menu per scegliere direttamente
la visualizzazione preferita. La scelta viene salvata anche dopo il riavvio:

| Vista | Esempio |
| --- | --- |
| Solo quota 5h | `Codex · 5h: 87% rim.` |
| Quota 5h + tempo al reset (predefinita) | `Codex · 5h: 87% (4h 30m)` |
| Tutte le finestre | `Codex · 5h: 87% · 7g: 41% rim.` |

Le percentuali sono **rimanenti**, condivise da tutti i client Codex dell'account:
non misurano il consumo della singola conversazione. Le finestre e le loro durate
sono ricavate dalla risposta del servizio; `5h` e `7g` sono esempi.

## Installazione

Clonare il repository in `~/.config/opencode/plugins/codex-usage` e installare
le dipendenze con [Bun](https://bun.sh):

```sh
git clone https://github.com/paolosapone/opencode-codex-usage-plugin.git ~/.config/opencode/plugins/codex-usage
cd ~/.config/opencode/plugins/codex-usage
bun install
```

Su Windows, `~` indica la cartella dell'utente, per esempio `C:\Users\nome`.

Aggiungere il plugin a `~/.config/opencode/tui.json`, mantenendo le eventuali
altre voci già presenti:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./plugins/codex-usage/index.tsx"]
}
```

Chiudere e riavviare OpenCode per caricarlo. Collegare OpenAI tramite `/connect`
scegliendo il login **ChatGPT**: una chiave API non è sufficiente.

Per disabilitare il plugin, rimuovere la voce da `tui.json` e riavviare OpenCode,
oppure usare il gestore Plugins nella palette.

## Uso

- `/codex-usage`: apre i dettagli con tutte le finestre disponibili, il piano (se restituito dal servizio), i reset nel fuso locale e l'ultimo aggiornamento.
- `/codex-usage-refresh`: aggiorna e apre i dettagli.
- `/codex-usage-view`: apre il menu delle visualizzazioni, con la vista attiva evidenziata.
- Click sinistro sull'indicatore: apre i dettagli **al rilascio del mouse**. Basta un solo `Esc` per chiuderli; un secondo click sull'indicatore li chiude, se raggiungibile.
- Click destro: apre lo stesso menu delle visualizzazioni. Selezionare una voce applica e salva la preferenza; `Esc` chiude senza modificarla.

I tre comandi sono disponibili anche nella palette, nella categoria **Codex**,
come **Codex: quota e reset**, **Codex: aggiorna quota** e **Codex: scegli visualizzazione**.

La scelta della vista è condivisa tra home e conversazioni e salvata nella KV
della TUI. Senza una preferenza valida si usa **Quota 5h + tempo al reset**.
Se la finestra 5h non è disponibile, compare `Codex · 5h: n/d`.
I dettagli mostrano sempre tutte le finestre, indipendentemente dalla vista scelta.

### Indicatore e colori

Sotto **90 colonne di larghezza del terminale**, l'indicatore usa il formato compatto:

```text
87% (4h 30m)
```

Le viste senza countdown mantengono il formato compatto `Codex 72% rim.`
(la quota minima tra le finestre selezionate).

Il tempo al reset è calcolato dalla scadenza restituita dal servizio e aggiornato
ogni minuto, anche se l'aggiornamento della quota fallisce. I minuti sono
arrotondati per eccesso; sotto un'ora compare, per esempio, `(42m)`.
Se la scadenza manca compare `(reset n/d)`; se è raggiunta compare
`(reset in attesa)` fino a nuovi dati, senza riportare automaticamente la quota al 100%.

La percentuale e il colore dipendono dalle finestre della vista selezionata:
solo 5h nella vista iniziale, oppure la percentuale più bassa nel riepilogo completo.
Le percentuali dell'indicatore sono arrotondate per difetto; nei dettagli hanno
al massimo una cifra decimale.

| Stato | Indicazione |
| --- | --- |
| Quota oltre il 25% | Colore di successo del tema (normalmente verde) |
| Quota oltre il 10% e fino al 25% | Colore di avviso (normalmente giallo) |
| Quota fino al 10% | Colore di errore (normalmente rosso) |
| Aggiornamento in corso | Suffisso `…`, oppure `Codex · …` se mancano ancora i dati |
| Errore con dati precedenti disponibili | Suffisso `*` e colore di avviso |
| Login mancante, non valido o scaduto | `Codex · login` |
| Altro errore senza dati disponibili | `Codex · offline` |

Senza dati, o se la finestra 5h manca nella vista dedicata, viene usato il colore
attenuato del tema; in presenza di un errore prevale sempre il colore di avviso.
Il messaggio dell'errore è disponibile nei dettagli.

### Aggiornamenti

- All'avvio del plugin.
- Automaticamente ogni **60 secondi**.
- All'evento `session.idle`, normalmente a fine risposta, con almeno **15 secondi** tra gli aggiornamenti attivati da questi eventi.
- Su richiesta con `/codex-usage-refresh`.

Le richieste simultanee condividono l'aggiornamento già in corso. I dettagli
rappresentano lo stato al momento dell'apertura: per vedere dati successivi,
riaprirli o usare `/codex-usage-refresh`.

## Credenziali e rete

Il plugin legge la voce OAuth `openai` da `$XDG_DATA_HOME/opencode/auth.json`
se `XDG_DATA_HOME` è un percorso assoluto, altrimenti da
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
HTTP o altri dati sensibili. Dopo un errore di rete, HTTP o di formato, i dati
precedenti restano visibili e sono marcati come non aggiornati. In caso di errore
di autenticazione o login scaduto vengono rimossi; anche un cambio di account
scarta la quota precedente prima di caricare quella nuova.

## Sviluppo

```sh
bun install
bun run typecheck
bun run test
```

Per verificare l'endpoint reale con le credenziali locali e stampare quota e reset:

```sh
bun run check:live
```

OpenCode fornisce a runtime Solid/OpenTUI e compila il TSX tramite il proprio
loader. Le dipendenze locali servono per sviluppo e verifiche.
I test TUI usano la condizione `browser` di Solid per avere la reattività,
come il runtime Solid fornito da OpenCode.
