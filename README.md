# Vešala - Srpska Verzija

Igra vešala za dva igrača na srpskom jeziku, implementirana kao web aplikacija.

## Opis igre

Ovo je klasična igra vešala sa sledećim pravilima:
- Prvi igrač zadaje reč
- Drugi igrač pogađa slovo po slovo ili celu reč
- Za svako pogrešno slovo ili reč, iscrtava se deo figure obešenog čoveka
- Igra se završava kada igrač potpuno pogodi reč ili kada se iscrta cela figura (6 pogrešnih pokušaja)

## Tehnologije

- **Backend**: Node.js sa Express i Socket.IO
- **Frontend**: HTML, CSS, JavaScript

## Kako pokrenuti aplikaciju

### Lokalno pokretanje

1. Klonirajte repozitorijum
2. Instalirajte zavisnosti:
   ```
   npm install
   ```
3. Pokrenite server:
   ```
   npm start
   ```
4. Otvorite browser i pristupite aplikaciji na adresi `http://localhost:3000`

### Hostovanje na Google Cloud (opcija 1: Google App Engine)

1. Instalirajte [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. Inicijalizujte gcloud ako već niste:
   ```
   gcloud init
   ```
3. Dodajte fajl `app.yaml` sa sadržajem:
   ```yaml
   runtime: nodejs16
   
   env_variables:
     NODE_ENV: "production"
   ```
4. Deployujte aplikaciju:
   ```
   gcloud app deploy
   ```

### Hostovanje na Google Cloud (opcija 2: Compute Engine)

1. Kreirajte VM instancu na Google Compute Engine
2. Povežite se na instancu preko SSH
3. Instalirajte Node.js:
   ```
   curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Klonirajte repozitorijum i instalirajte zavisnosti:
   ```
   git clone <url-vaseg-repozitorijuma>
   cd vesala-igra
   npm install
   ```
5. Instalirajte PM2 za upravljanje procesima:
   ```
   npm install -g pm2
   ```
6. Pokrenite aplikaciju:
   ```
   pm2 start server.js
   ```
7. Konfigurišite firewall pravila da dozvolite saobraćaj na portu 3000

## Kako igrati

1. Prvi igrač kreira novu igru i dobija jedinstveni ID igre
2. Prvi igrač šalje ID igre drugom igraču
3. Drugi igrač se pridružuje igri koristeći dobijeni ID
4. Prvi igrač unosi reč koju će drugi igrač pogađati
5. Drugi igrač pokušava da pogodi reč slovo po slovo ili unošenjem cele reči
6. Nakon završetka igre, igrači mogu započeti novu igru klikom na dugme "Igraj ponovo"

## Struktura projekta

- `server.js` - Node.js server
- `public/index.html` - Frontend aplikacija
- `package.json` - Konfiguracija projekta

## Dodatne informacije

- Igra pamti stanje sve dok su oba igrača povezana
- Ako jedan igrač prekine vezu, igra se resetuje
- Za svaku novu igru generiše se jedinstveni ID igre
