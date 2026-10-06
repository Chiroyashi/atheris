// Discord cuma memberi 3 detik untuk respons pertama sebuah interaction. Kalau lewat,
// token-nya dibuang (10062) dan user cuma lihat "The application did not respond".
// `first()` menjaga respons itu tetap muat di dalam jendela: coba, dan kalau gagal
// selama masih ada sisa waktu, coba lagi.
//
// ponytail: backoff tetap pendek dan jumlah percobaan dibatasi oleh sisa jendela 3 detik.
// Menunggu tidak akan memperbaiki connect yang macet, dan retry terus-menerus cuma
// membakar token yang sudah tidak berguna.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function first(send, { budgetMs = 2500, backoffMs = 120, label = 'respond' } = {}) {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      // 10062 = token sudah dibuang Discord, mengulangi tidak akan menolong.
      if (err.code === 10062 || Date.now() >= deadline) throw err;
      console.warn(`[retry] ${label} gagal (${attempt}), ulang: ${err.message}`);
      await sleep(backoffMs);
    }
  }
}
