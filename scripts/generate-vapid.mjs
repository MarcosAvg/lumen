// Genera un par de claves VAPID para Web Push.
//
//   pnpm vapid:generate
//
// Copia el resultado en tu `.env`. La clave privada es un secreto: no la
// compartas ni la incluyas en imágenes o repositorios.
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('# Añade estas variables a tu .env');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@example.com');
