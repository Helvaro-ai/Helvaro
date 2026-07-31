'use strict';
/*
 * Language registry for Helvaro's WhatsApp AI conversation + dashboard.
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_credits.js, api/_mailer.js, api/_pgapi.js, api/_gcal.js,
 * api/_plan.js, api/_signup-guard.js) — the route count stays at 11.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
 * Before this file, api/whatsapp.js hardcoded THREE languages (nl/fr/en):
 * one `langDirective` string, one `reasonLangNote`, one `escalatePhrase`,
 * one `completedMsgs` object, etc — each a hand-written object literal keyed
 * nl/fr/en. Every new language meant touching every one of those call
 * sites AND hand-writing a new prompt string per site. That does not scale
 * to 40 languages and rots fast (miss one site, one language silently
 * behaves wrong). This file is the single source of truth: a data table
 * (LANGUAGES below) plus small generator functions that DERIVE the
 * system-prompt directive, date-locale, and template-fallback behaviour
 * FROM that table. Add a language by adding one registry row, not by
 * touching N call sites.
 *
 * ── EXACT BACKWARDS COMPATIBILITY FOR nl/fr/en ─────────────────────────
 * The three original languages keep their EXACT existing hand-written
 * prompt strings (see `legacyDirective` / `legacyReasonNote` /
 * `legacyEscalate` / `legacyCompleted` / `legacyCallback` / `legacyConfirm`
 * below) — byte-for-byte what api/whatsapp.js used to inline. Every other
 * language falls through to the generator functions. This guarantees zero
 * behaviour change for existing nl/fr/en clients while making every new
 * language scale automatically.
 *
 * ── FORMALITY ────────────────────────────────────────────────────────────
 * Sindi's explicit brand choice (confirmed for nl/fr today): warm and
 * informal-but-professional, never stiff-formal-by-default. That intent is
 * carried across every language via the `formality` field:
 *   TV_INFORMAL    - the language has a grammatical informal/formal 2nd-
 *                     person pair (tu/vous-style). Lean informal, exactly
 *                     like the existing nl "je/jij, nooit u" rule. The
 *                     `informalPronoun` field names the informal form so
 *                     the generated directive can say so explicitly.
 *   DEFAULT_CASUAL  - modern everyday usage in this language has already
 *                     dropped the formal register for casual contexts
 *                     (Scandinavian languages, English) — casual is simply
 *                     the norm, no pronoun call-out needed.
 *   WARM_NEUTRAL    - languages where asserting ONE blanket pronoun/register
 *                     rule would be a linguistic oversimplification (CJK
 *                     honorific systems, Arabic/Persian/Urdu/Hebrew register
 *                     variation, Hindi). These get a tone-level instruction
 *                     (warm, friendly, moderately casual — not stiff or
 *                     bureaucratic) instead of a pronoun-level claim I can't
 *                     confidently make.
 * NOTE for Sindi: Polish and Persian in particular have a culturally
 * stronger default-formal register in business contexts than nl/fr/de — I
 * still marked them TV_INFORMAL per the "carry informal-but-professional
 * everywhere" instruction, but flagging it here in case you want to
 * reconsider those two specifically once you see it live.
 *
 * ── TRANSLATION QUALITY (please read before shipping) ──────────────────
 * The four short fixed UI strings per language below (completed / callback /
 * confirm / escalate — the messages sent WITHOUT going through the AI, e.g.
 * "conversation already completed" or a booking confirmation) are AI-
 * translated for every language except nl/fr/en (which are the original,
 * human-written strings, untouched). They're short, formulaic business
 * sentences and should read fine, but — like any i18n launch — deserve a
 * native-speaker pass before high-volume production use, especially for
 * scripts I have lower confidence in (Thai, Vietnamese, Korean, Japanese,
 * Chinese, Arabic-script languages). This does NOT affect the actual AI
 * conversation (the vast majority of every lead's messages): that's
 * generated live by Claude from the `directive` instruction below, in
 * fluent target-language prose, not from a static string table.
 *
 * ── RTL LANGUAGES (ar, fa, ur, he) ──────────────────────────────────────
 * No special handling needed for the WhatsApp side — WhatsApp renders RTL
 * itself. `rtl:true` below is used by api/dashboard.js to add `dir="auto"`
 * to conversation-history bubbles so the dashboard's own UI doesn't render
 * RTL text left-aligned/reversed when a staff member reviews the chat.
 */

// ── Formality categories (see file header) ─────────────────────────────────
const FORMALITY = {
  TV_INFORMAL:    'tv_informal',
  DEFAULT_CASUAL: 'default_casual',
  WARM_NEUTRAL:   'warm_neutral',
};

// ── The registry ─────────────────────────────────────────────────────────
// iso            - stored value (Airtable Language field, ?lang= etc)
// native         - name in the language's own script, for the dashboard picker
// english        - English name, used inside generated prompt directives
// locale         - BCP-47 tag for Intl.DateTimeFormat (Europe/Brussels tz is
//                  passed separately at call time, see formatApptDateTime)
// formality      - one of FORMALITY.*
// informalPronoun- only set for TV_INFORMAL; named explicitly in the directive
// rtl            - true for right-to-left scripts
// legacy*        - EXACT pre-existing strings for nl/fr/en. Present only on
//                  these three; every other language falls through to the
//                  generator functions below.
const LANGUAGES = {
  nl: {
    iso: 'nl', native: 'Nederlands', english: 'Dutch', locale: 'nl-BE',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'je/jij',
    legacyDirective: 'BELANGRIJK. Antwoord ALTIJD in het Nederlands (België). Gebruik "je" en "jij", nooit "u". Negeer de taal die de lead gebruikt. Antwoord altijd in het Nederlands.',
    legacyReasonNote: 'in het Nederlands',
    legacyEscalate: 'Goeie vraag. Ik check dat even bij een collega en kom binnen 30 min bij je terug.',
    legacyCompleted: 'Bedankt voor je interesse. We nemen spoedig contact met je op.',
    legacyCallback: (w) => `Goed, dan zit het in orde. Een collega van mij belt of appt je ${w}. Je hoeft verder niets te doen. Wij komen naar jou toe.`,
    legacyConfirm: (name, when, addr) => `Bevestigd. Je afspraak bij ${name} staat gepland op ${when}.${addr ? ` Adres: ${addr}.` : ''}`,
  },
  fr: {
    iso: 'fr', native: 'Français', english: 'French', locale: 'fr-BE',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tu/toi',
    legacyDirective: 'IMPORTANT. Réponds TOUJOURS en français (Belgique). Utilise "tu" et "toi" pour rester décontracté. Ignore la langue que le lead utilise. Réponds toujours en français.',
    legacyReasonNote: 'en français',
    legacyEscalate: 'Bonne question. Je vérifie avec un collègue et je reviens vers toi dans 30 min.',
    legacyCompleted: 'Merci pour votre intérêt. Nous vous recontactons bientôt.',
    legacyCallback: (w) => `Parfait. Un collègue te contactera ${w}. Tu n'as plus rien à faire. Nous revenons vers toi.`,
    legacyConfirm: (name, when, addr) => `Confirmé. Ton rendez-vous chez ${name} est prévu le ${when}.${addr ? ` Adresse : ${addr}.` : ''}`,
  },
  en: {
    iso: 'en', native: 'English', english: 'English', locale: 'en-GB',
    formality: FORMALITY.DEFAULT_CASUAL, informalPronoun: '',
    legacyDirective: 'IMPORTANT. Reply ALWAYS in English. Use casual "you", contractions OK. Ignore whatever language the lead uses. Always reply in English.',
    legacyReasonNote: 'in English',
    legacyEscalate: 'Good question. Let me check with a colleague, I will get back to you within 30 min.',
    legacyCompleted: 'Thanks for your interest. We will be in touch shortly.',
    legacyCallback: (w) => `Perfect. A colleague will reach out to you ${w}. You don't need to do anything else. We will come back to you.`,
    legacyConfirm: (name, when, addr) => `Confirmed. Your appointment with ${name} is booked for ${when}.${addr ? ` Address: ${addr}.` : ''}`,
  },

  de: {
    iso: 'de', native: 'Deutsch', english: 'German', locale: 'de-BE', // Belgium's third official language
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'du',
    completed: 'Danke für dein Interesse. Wir melden uns in Kürze bei dir.',
    callback: (w) => `Perfekt. Ein Kollege meldet sich ${w} bei dir. Du musst nichts weiter tun. Wir kommen auf dich zu.`,
    confirm: (name, when, addr) => `Bestätigt. Dein Termin bei ${name} ist für ${when} geplant.${addr ? ` Adresse: ${addr}.` : ''}`,
    escalate: 'Gute Frage. Ich frage kurz einen Kollegen und melde mich innerhalb von 30 Minuten bei dir zurück.',
  },
  es: {
    iso: 'es', native: 'Español', english: 'Spanish', locale: 'es-ES',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tú',
    completed: 'Gracias por tu interés. Nos pondremos en contacto contigo pronto.',
    callback: (w) => `Perfecto. Un compañero te contactará ${w}. No tienes que hacer nada más. Nosotros te contactaremos.`,
    confirm: (name, when, addr) => `Confirmado. Tu cita con ${name} está programada para el ${when}.${addr ? ` Dirección: ${addr}.` : ''}`,
    escalate: 'Buena pregunta. Voy a consultarlo con un compañero y te responderé en 30 minutos.',
  },
  it: {
    iso: 'it', native: 'Italiano', english: 'Italian', locale: 'it-IT',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tu',
    completed: 'Grazie per il tuo interesse. Ti contatteremo presto.',
    callback: (w) => `Perfetto. Un collega ti contatterà ${w}. Non devi fare altro. Ti ricontatteremo noi.`,
    confirm: (name, when, addr) => `Confermato. Il tuo appuntamento con ${name} è previsto per ${when}.${addr ? ` Indirizzo: ${addr}.` : ''}`,
    escalate: 'Ottima domanda. Lo chiedo a un collega e ti rispondo entro 30 minuti.',
  },
  pt: {
    iso: 'pt', native: 'Português', english: 'Portuguese', locale: 'pt-PT',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tu',
    completed: 'Obrigado pelo teu interesse. Entraremos em contacto em breve.',
    callback: (w) => `Perfeito. Um colega vai contactar-te ${w}. Não precisas de fazer mais nada. Nós entramos em contacto contigo.`,
    confirm: (name, when, addr) => `Confirmado. A tua marcação com ${name} está agendada para ${when}.${addr ? ` Morada: ${addr}.` : ''}`,
    escalate: 'Boa pergunta. Vou verificar com um colega e volto a contactar-te dentro de 30 minutos.',
  },
  pl: {
    iso: 'pl', native: 'Polski', english: 'Polish', locale: 'pl-PL',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ty',
    completed: 'Dziękujemy za zainteresowanie. Skontaktujemy się z Tobą wkrótce.',
    callback: (w) => `Świetnie. Kolega skontaktuje się z Tobą ${w}. Nie musisz nic więcej robić. Odezwiemy się do Ciebie.`,
    confirm: (name, when, addr) => `Potwierdzone. Twoja wizyta w ${name} jest zaplanowana na ${when}.${addr ? ` Adres: ${addr}.` : ''}`,
    escalate: 'Dobre pytanie. Sprawdzę to z kolegą i wrócę do Ciebie w ciągu 30 minut.',
  },
  ro: {
    iso: 'ro', native: 'Română', english: 'Romanian', locale: 'ro-RO',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tu',
    completed: 'Mulțumim pentru interes. Te vom contacta în curând.',
    callback: (w) => `Perfect. Un coleg te va contacta ${w}. Nu trebuie să faci nimic altceva. Te vom contacta noi.`,
    confirm: (name, when, addr) => `Confirmat. Programarea ta la ${name} este planificată pentru ${when}.${addr ? ` Adresă: ${addr}.` : ''}`,
    escalate: 'Bună întrebare. Verific cu un coleg și revin către tine în 30 de minute.',
  },
  cs: {
    iso: 'cs', native: 'Čeština', english: 'Czech', locale: 'cs-CZ',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ty',
    completed: 'Děkujeme za tvůj zájem. Brzy se ti ozveme.',
    callback: (w) => `Skvělé. Kolega se ti ozve ${w}. Nemusíš nic dalšího dělat. Ozveme se ti my.`,
    confirm: (name, when, addr) => `Potvrzeno. Tvoje schůzka u ${name} je naplánovaná na ${when}.${addr ? ` Adresa: ${addr}.` : ''}`,
    escalate: 'Dobrá otázka. Ověřím to s kolegou a ozvu se ti do 30 minut.',
  },
  sk: {
    iso: 'sk', native: 'Slovenčina', english: 'Slovak', locale: 'sk-SK',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ty',
    completed: 'Ďakujeme za tvoj záujem. Čoskoro sa ti ozveme.',
    callback: (w) => `Skvelé. Kolega sa ti ozve ${w}. Nemusíš nič ďalšie robiť. Ozveme sa ti my.`,
    confirm: (name, when, addr) => `Potvrdené. Tvoje stretnutie u ${name} je naplánované na ${when}.${addr ? ` Adresa: ${addr}.` : ''}`,
    escalate: 'Dobrá otázka. Overím to s kolegom a ozvem sa ti do 30 minút.',
  },
  hu: {
    iso: 'hu', native: 'Magyar', english: 'Hungarian', locale: 'hu-HU',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'te',
    completed: 'Köszönjük az érdeklődésed. Hamarosan felvesszük veled a kapcsolatot.',
    callback: (w) => `Rendben. Egy kollégám ${w} jelentkezik nálad. Neked semmi mást nem kell tenned. Mi keresünk téged.`,
    confirm: (name, when, addr) => `Megerősítve. A(z) ${name} időpontod ${when} időpontra van beütemezve.${addr ? ` Cím: ${addr}.` : ''}`,
    escalate: 'Jó kérdés. Megkérdezem egy kollégámtól, és 30 percen belül visszajelzek.',
  },
  bg: {
    iso: 'bg', native: 'Български', english: 'Bulgarian', locale: 'bg-BG',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ти',
    completed: 'Благодарим за интереса ти. Ще се свържем с теб скоро.',
    callback: (w) => `Чудесно. Колега ще се свърже с теб ${w}. Не е нужно да правиш нищо друго. Ние ще се свържем с теб.`,
    confirm: (name, when, addr) => `Потвърдено. Часът ти при ${name} е насрочен за ${when}.${addr ? ` Адрес: ${addr}.` : ''}`,
    escalate: 'Добър въпрос. Ще проверя с колега и ще се свържа с теб до 30 минути.',
  },
  hr: {
    iso: 'hr', native: 'Hrvatski', english: 'Croatian', locale: 'hr-HR',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ti',
    completed: 'Hvala na interesu. Uskoro ćemo te kontaktirati.',
    callback: (w) => `Super. Kolega će te kontaktirati ${w}. Ne moraš ništa više učiniti. Mi ćemo te kontaktirati.`,
    confirm: (name, when, addr) => `Potvrđeno. Tvoj termin kod ${name} zakazan je za ${when}.${addr ? ` Adresa: ${addr}.` : ''}`,
    escalate: 'Dobro pitanje. Provjerit ću s kolegom i javiti ti se unutar 30 minuta.',
  },
  sl: {
    iso: 'sl', native: 'Slovenščina', english: 'Slovenian', locale: 'sl-SI',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ti',
    completed: 'Hvala za tvoje zanimanje. Kmalu se ti bomo oglasili.',
    callback: (w) => `Odlično. Sodelavec te bo kontaktiral ${w}. Tebi ni treba storiti ničesar več. Mi se bomo oglasili.`,
    confirm: (name, when, addr) => `Potrjeno. Tvoj termin pri ${name} je predviden za ${when}.${addr ? ` Naslov: ${addr}.` : ''}`,
    escalate: 'Dobro vprašanje. Preverim pri sodelavcu in se ti oglasim v 30 minutah.',
  },
  el: {
    iso: 'el', native: 'Ελληνικά', english: 'Greek', locale: 'el-GR',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'εσύ',
    completed: 'Ευχαριστούμε για το ενδιαφέρον σου. Θα επικοινωνήσουμε μαζί σου σύντομα.',
    callback: (w) => `Τέλεια. Ένας συνάδελφος θα επικοινωνήσει μαζί σου ${w}. Δεν χρειάζεται να κάνεις τίποτα άλλο. Θα σε καλέσουμε εμείς.`,
    confirm: (name, when, addr) => `Επιβεβαιώθηκε. Το ραντεβού σου με ${name} έχει προγραμματιστεί για ${when}.${addr ? ` Διεύθυνση: ${addr}.` : ''}`,
    escalate: 'Καλή ερώτηση. Θα το ελέγξω με έναν συνάδελφο και θα επικοινωνήσω μαζί σου εντός 30 λεπτών.',
  },
  sv: {
    iso: 'sv', native: 'Svenska', english: 'Swedish', locale: 'sv-SE',
    formality: FORMALITY.DEFAULT_CASUAL, informalPronoun: '',
    completed: 'Tack för ditt intresse. Vi hör av oss inom kort.',
    callback: (w) => `Perfekt. En kollega hör av sig till dig ${w}. Du behöver inte göra något mer. Vi kontaktar dig.`,
    confirm: (name, when, addr) => `Bekräftat. Din tid hos ${name} är bokad till ${when}.${addr ? ` Adress: ${addr}.` : ''}`,
    escalate: 'Bra fråga. Jag kollar med en kollega och återkommer till dig inom 30 minuter.',
  },
  da: {
    iso: 'da', native: 'Dansk', english: 'Danish', locale: 'da-DK',
    formality: FORMALITY.DEFAULT_CASUAL, informalPronoun: '',
    completed: 'Tak for din interesse. Vi kontakter dig snart.',
    callback: (w) => `Perfekt. En kollega kontakter dig ${w}. Du behøver ikke gøre mere. Vi vender tilbage til dig.`,
    confirm: (name, when, addr) => `Bekræftet. Din aftale hos ${name} er planlagt til ${when}.${addr ? ` Adresse: ${addr}.` : ''}`,
    escalate: 'Godt spørgsmål. Jeg tjekker med en kollega og vender tilbage inden for 30 minutter.',
  },
  no: {
    iso: 'no', native: 'Norsk', english: 'Norwegian', locale: 'nb-NO',
    formality: FORMALITY.DEFAULT_CASUAL, informalPronoun: '',
    completed: 'Takk for din interesse. Vi tar kontakt med deg snart.',
    callback: (w) => `Perfekt. En kollega kontakter deg ${w}. Du trenger ikke gjøre noe mer. Vi tar kontakt med deg.`,
    confirm: (name, when, addr) => `Bekreftet. Timen din hos ${name} er planlagt til ${when}.${addr ? ` Adresse: ${addr}.` : ''}`,
    escalate: 'Godt spørsmål. Jeg sjekker med en kollega og gir deg svar innen 30 minutter.',
  },
  fi: {
    iso: 'fi', native: 'Suomi', english: 'Finnish', locale: 'fi-FI',
    formality: FORMALITY.DEFAULT_CASUAL, informalPronoun: '',
    completed: 'Kiitos kiinnostuksestasi. Otamme sinuun pian yhteyttä.',
    callback: (w) => `Selvä. Kollegani ottaa sinuun yhteyttä ${w}. Sinun ei tarvitse tehdä muuta. Otamme sinuun yhteyttä.`,
    confirm: (name, when, addr) => `Vahvistettu. Aikasi ${name} on varattu ajalle ${when}.${addr ? ` Osoite: ${addr}.` : ''}`,
    escalate: 'Hyvä kysymys. Tarkistan asian kollegalta ja palaan asiaan 30 minuutin sisällä.',
  },
  lt: {
    iso: 'lt', native: 'Lietuvių', english: 'Lithuanian', locale: 'lt-LT',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tu',
    completed: 'Ačiū už susidomėjimą. Netrukus su tavimi susisieksime.',
    callback: (w) => `Puiku. Kolega su tavimi susisieks ${w}. Tau daugiau nieko daryti nereikia. Mes su tavimi susisieksime.`,
    confirm: (name, when, addr) => `Patvirtinta. Tavo susitikimas su ${name} suplanuotas ${when}.${addr ? ` Adresas: ${addr}.` : ''}`,
    escalate: 'Geras klausimas. Pasitikrinsiu su kolega ir atsakysiu per 30 minučių.',
  },
  lv: {
    iso: 'lv', native: 'Latviešu', english: 'Latvian', locale: 'lv-LV',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'tu',
    completed: 'Paldies par interesi. Drīz ar tevi sazināsimies.',
    callback: (w) => `Lieliski. Kolēģis ar tevi sazināsies ${w}. Tev vairs nekas nav jādara. Mēs ar tevi sazināsimies.`,
    confirm: (name, when, addr) => `Apstiprināts. Tava tikšanās ar ${name} ir plānota ${when}.${addr ? ` Adrese: ${addr}.` : ''}`,
    escalate: 'Labs jautājums. Pārbaudīšu pie kolēģa un atbildēšu 30 minūšu laikā.',
  },
  et: {
    iso: 'et', native: 'Eesti', english: 'Estonian', locale: 'et-EE',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'sina',
    completed: 'Aitäh huvi eest. Võtame sinuga peagi ühendust.',
    callback: (w) => `Suurepärane. Kolleeg võtab sinuga ühendust ${w}. Sul pole vaja midagi rohkem teha. Meie võtame sinuga ühendust.`,
    confirm: (name, when, addr) => `Kinnitatud. Sinu aeg ${name} juures on planeeritud ${when}.${addr ? ` Aadress: ${addr}.` : ''}`,
    escalate: 'Hea küsimus. Kontrollin kolleegiga ja annan 30 minuti jooksul vastuse.',
  },
  uk: {
    iso: 'uk', native: 'Українська', english: 'Ukrainian', locale: 'uk-UA',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ти',
    completed: "Дякуємо за твій інтерес. Ми скоро з тобою зв'яжемося.",
    callback: (w) => `Чудово. Колега зв'яжеться з тобою ${w}. Тобі більше нічого не потрібно робити. Ми з тобою зв'яжемося.`,
    confirm: (name, when, addr) => `Підтверджено. Твій запис до ${name} заплановано на ${when}.${addr ? ` Адреса: ${addr}.` : ''}`,
    escalate: 'Гарне питання. Уточню в колеги і повернуся з відповіддю протягом 30 хвилин.',
  },
  ru: {
    iso: 'ru', native: 'Русский', english: 'Russian', locale: 'ru-RU',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ты',
    completed: 'Спасибо за интерес. Мы скоро свяжемся с тобой.',
    callback: (w) => `Отлично. Коллега свяжется с тобой ${w}. Тебе больше ничего делать не нужно. Мы сами с тобой свяжемся.`,
    confirm: (name, when, addr) => `Подтверждено. Твоя запись к ${name} назначена на ${when}.${addr ? ` Адрес: ${addr}.` : ''}`,
    escalate: 'Хороший вопрос. Уточню у коллеги и отвечу тебе в течение 30 минут.',
  },
  tr: {
    iso: 'tr', native: 'Türkçe', english: 'Turkish', locale: 'tr-TR',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'sen',
    completed: 'İlgin için teşekkürler. Yakında seninle iletişime geçeceğiz.',
    callback: (w) => `Harika. Bir meslektaşım ${w} seninle iletişime geçecek. Başka bir şey yapmana gerek yok. Biz seninle iletişime geçeceğiz.`,
    confirm: (name, when, addr) => `Onaylandı. ${name} ile randevun ${when} için planlandı.${addr ? ` Adres: ${addr}.` : ''}`,
    escalate: 'Güzel soru. Bir meslektaşıma soracağım ve 30 dakika içinde sana geri döneceğim.',
  },
  sq: {
    iso: 'sq', native: 'Shqip', english: 'Albanian', locale: 'sq-AL',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ti',
    completed: 'Faleminderit për interesin. Do të kontaktojmë së shpejti.',
    callback: (w) => `Perfekte. Një koleg do të të kontaktojë ${w}. Nuk të duhet të bësh asgjë tjetër. Ne do të të kontaktojmë.`,
    confirm: (name, when, addr) => `Konfirmuar. Takimi yt me ${name} është planifikuar për ${when}.${addr ? ` Adresa: ${addr}.` : ''}`,
    escalate: 'Pyetje e mirë. Do ta kontrolloj me një koleg dhe do të kthehem brenda 30 minutave.',
  },
  sr: {
    iso: 'sr', native: 'Српски', english: 'Serbian', locale: 'sr-RS',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ti',
    completed: 'Hvala na interesovanju. Uskoro ćemo te kontaktirati.',
    callback: (w) => `Odlično. Kolega će te kontaktirati ${w}. Ne moraš ništa više da radiš. Mi ćemo te kontaktirati.`,
    confirm: (name, when, addr) => `Potvrđeno. Tvoj termin kod ${name} je zakazan za ${when}.${addr ? ` Adresa: ${addr}.` : ''}`,
    escalate: 'Dobro pitanje. Proveriću sa kolegom i javiću ti se u roku od 30 minuta.',
  },
  mk: {
    iso: 'mk', native: 'Македонски', english: 'Macedonian', locale: 'mk-MK',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'ти',
    completed: 'Ви благодариме за интересот. Наскоро ќе стапиме во контакт.',
    callback: (w) => `Одлично. Колега ќе те контактира ${w}. Не треба да правиш ништо повеќе. Ние ќе те контактираме.`,
    confirm: (name, when, addr) => `Потврдено. Твојот термин кај ${name} е закажан за ${when}.${addr ? ` Адреса: ${addr}.` : ''}`,
    escalate: 'Добро прашање. Ќе проверам со колега и ќе се јавам во рок од 30 минути.',
  },
  ar: {
    iso: 'ar', native: 'العربية', english: 'Arabic', locale: 'ar-SA', rtl: true,
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'شكرًا لاهتمامك. سنتواصل معك قريبًا.',
    callback: (w) => `ممتاز. سيتواصل معك أحد الزملاء ${w}. لا داعي لفعل أي شيء آخر. سنتواصل معك نحن.`,
    confirm: (name, when, addr) => `تم التأكيد. موعدك مع ${name} مُحدد في ${when}.${addr ? ` العنوان: ${addr}.` : ''}`,
    escalate: 'سؤال جيد. سأتحقق من ذلك مع أحد الزملاء وأعود إليك خلال 30 دقيقة.',
  },
  fa: {
    iso: 'fa', native: 'فارسی', english: 'Persian', locale: 'fa-IR', rtl: true,
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'تو',
    completed: 'از علاقه‌ات متشکریم. به‌زودی با تو تماس می‌گیریم.',
    callback: (w) => `عالی. یکی از همکاران ${w} با تو تماس می‌گیرد. لازم نیست کار دیگری انجام بدهی. ما با تو تماس می‌گیریم.`,
    confirm: (name, when, addr) => `تأیید شد. نوبت تو با ${name} برای ${when} برنامه‌ریزی شده است.${addr ? ` آدرس: ${addr}.` : ''}`,
    escalate: 'سؤال خوبی بود. با یکی از همکاران بررسی می‌کنم و ظرف ۳۰ دقیقه به تو پاسخ می‌دهم.',
  },
  ur: {
    iso: 'ur', native: 'اردو', english: 'Urdu', locale: 'ur-PK', rtl: true,
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'آپ کی دلچسپی کا شکریہ۔ ہم جلد آپ سے رابطہ کریں گے۔',
    callback: (w) => `بہترین۔ ایک ساتھی ${w} آپ سے رابطہ کرے گا۔ آپ کو مزید کچھ کرنے کی ضرورت نہیں۔ ہم آپ سے رابطہ کریں گے۔`,
    confirm: (name, when, addr) => `تصدیق ہو گئی۔ ${name} کے ساتھ آپ کی ملاقات ${when} کے لیے طے ہے۔${addr ? ` پتہ: ${addr}۔` : ''}`,
    escalate: 'اچھا سوال ہے۔ میں ایک ساتھی سے معلوم کرتا ہوں اور 30 منٹ میں آپ کو بتاتا ہوں۔',
  },
  he: {
    iso: 'he', native: 'עברית', english: 'Hebrew', locale: 'he-IL', rtl: true,
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'תודה על התעניינותך. ניצור איתך קשר בקרוב.',
    callback: (w) => `מעולה. עמית ייצור איתך קשר ${w}. אין צורך שתעשה משהו נוסף. אנחנו ניצור איתך קשר.`,
    confirm: (name, when, addr) => `אושר. הפגישה שלך עם ${name} נקבעה ל-${when}.${addr ? ` כתובת: ${addr}.` : ''}`,
    escalate: 'שאלה טובה. אבדוק עם עמית ואחזור אליך תוך 30 דקות.',
  },
  hi: {
    iso: 'hi', native: 'हिन्दी', english: 'Hindi', locale: 'hi-IN',
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'आपकी रुचि के लिए धन्यवाद। हम जल्द ही आपसे संपर्क करेंगे।',
    callback: (w) => `बढ़िया। एक सहकर्मी ${w} आपसे संपर्क करेगा। आपको और कुछ करने की ज़रूरत नहीं है। हम आपसे संपर्क करेंगे।`,
    confirm: (name, when, addr) => `पुष्टि हो गई। ${name} के साथ आपकी अपॉइंटमेंट ${when} के लिए तय है।${addr ? ` पता: ${addr}।` : ''}`,
    escalate: 'अच्छा सवाल है। मैं एक सहकर्मी से पूछता हूँ और 30 मिनट में आपको जवाब देता हूँ।',
  },
  zh: {
    iso: 'zh', native: '中文', english: 'Chinese', locale: 'zh-CN',
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: '感谢你的关注。我们会尽快与你联系。',
    callback: (w) => `好的。同事会在${w}联系你。你不需要再做任何事。我们会联系你。`,
    confirm: (name, when, addr) => `已确认。你在${name}的预约时间是${when}。${addr ? `地址：${addr}。` : ''}`,
    escalate: '好问题。我会向同事确认，并在30分钟内回复你。',
  },
  ja: {
    iso: 'ja', native: '日本語', english: 'Japanese', locale: 'ja-JP',
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'ご興味をお持ちいただきありがとうございます。近日中にご連絡いたします。',
    callback: (w) => `かしこまりました。担当者が${w}にご連絡いたします。これ以上お手続きは不要です。こちらからご連絡いたします。`,
    confirm: (name, when, addr) => `確定しました。${name}でのご予約は${when}に予定されています。${addr ? `住所：${addr}。` : ''}`,
    escalate: '良いご質問ですね。同僚に確認して、30分以内にご連絡します。',
  },
  ko: {
    iso: 'ko', native: '한국어', english: 'Korean', locale: 'ko-KR',
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: '관심 가져주셔서 감사합니다. 곧 연락드리겠습니다.',
    callback: (w) => `좋습니다. 담당 직원이 ${w} 연락드릴 예정입니다. 더 이상 하실 일은 없습니다. 저희가 연락드리겠습니다.`,
    confirm: (name, when, addr) => `확정되었습니다. ${name}과의 예약이 ${when}로 예정되어 있습니다.${addr ? ` 주소: ${addr}.` : ''}`,
    escalate: '좋은 질문이네요. 동료에게 확인하고 30분 안에 다시 연락드리겠습니다.',
  },
  vi: {
    iso: 'vi', native: 'Tiếng Việt', english: 'Vietnamese', locale: 'vi-VN',
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'Cảm ơn bạn đã quan tâm. Chúng tôi sẽ sớm liên hệ với bạn.',
    callback: (w) => `Tuyệt. Một đồng nghiệp sẽ liên hệ với bạn ${w}. Bạn không cần làm gì thêm. Chúng tôi sẽ liên hệ với bạn.`,
    confirm: (name, when, addr) => `Đã xác nhận. Lịch hẹn của bạn với ${name} được đặt vào ${when}.${addr ? ` Địa chỉ: ${addr}.` : ''}`,
    escalate: 'Câu hỏi hay. Tôi sẽ hỏi lại đồng nghiệp và phản hồi bạn trong vòng 30 phút.',
  },
  th: {
    iso: 'th', native: 'ไทย', english: 'Thai', locale: 'th-TH',
    formality: FORMALITY.WARM_NEUTRAL, informalPronoun: '',
    completed: 'ขอบคุณที่สนใจ เราจะติดต่อกลับในเร็วๆ นี้',
    callback: (w) => `เยี่ยมเลย เพื่อนร่วมงานจะติดต่อคุณ${w} คุณไม่ต้องทำอะไรเพิ่มเติม เราจะติดต่อคุณเอง`,
    confirm: (name, when, addr) => `ยืนยันแล้ว นัดหมายของคุณกับ ${name} กำหนดไว้ที่ ${when}${addr ? ` ที่อยู่: ${addr}` : ''}`,
    escalate: 'คำถามดีมาก ฉันจะเช็คกับเพื่อนร่วมงานแล้วตอบกลับภายใน 30 นาที',
  },
  id: {
    iso: 'id', native: 'Bahasa Indonesia', english: 'Indonesian', locale: 'id-ID',
    formality: FORMALITY.TV_INFORMAL, informalPronoun: 'kamu',
    completed: 'Terima kasih atas minat Anda. Kami akan segera menghubungi Anda.',
    callback: (w) => `Sip. Rekan kami akan menghubungi kamu ${w}. Kamu tidak perlu melakukan apa pun lagi. Kami akan menghubungi kamu.`,
    confirm: (name, when, addr) => `Dikonfirmasi. Janji temu kamu dengan ${name} dijadwalkan pada ${when}.${addr ? ` Alamat: ${addr}.` : ''}`,
    escalate: 'Pertanyaan bagus. Saya akan cek dengan rekan dan menghubungi kamu kembali dalam 30 menit.',
  },
};

const DEFAULT_CODE = 'nl';
const SUPPORTED_CODES = Object.keys(LANGUAGES);

// ── Core lookups ─────────────────────────────────────────────────────────

// Normalizes any raw Airtable/env/query value to a supported registry code,
// falling back to 'nl' (Helvaro's original, still-only, hardcoded default)
// for blank/unknown values — same fallback behaviour as the pre-registry
// `(rawLang === 'fr' || rawLang === 'en') ? rawLang : 'nl'` pattern that used
// to be duplicated at every call site across whatsapp.js/leads.js/
// cron-followup.js/admin.js/form-page.js.
function normalizeLanguageCode(raw, fallback) {
  const fb = (fallback && LANGUAGES[fallback]) ? fallback : DEFAULT_CODE;
  const code = String(raw || '').trim().toLowerCase();
  return LANGUAGES[code] ? code : fb;
}

function isSupportedLanguage(code) {
  return !!LANGUAGES[String(code || '').trim().toLowerCase()];
}

function getLanguage(code) {
  return LANGUAGES[normalizeLanguageCode(code)];
}

// [{code, native, english}] for the dashboard's language picker, Belgium's
// three official languages + English pinned first (most relevant to
// Helvaro's actual client base today), the rest alphabetical by English name.
function listForPicker() {
  const pinned = ['nl', 'fr', 'de', 'en'];
  const rest = SUPPORTED_CODES.filter(c => !pinned.includes(c))
    .sort((a, b) => LANGUAGES[a].english.localeCompare(LANGUAGES[b].english));
  return [...pinned, ...rest].map(code => ({
    code, native: LANGUAGES[code].native, english: LANGUAGES[code].english,
  }));
}

// ── System-prompt generation (the core "don't hand-write 40 strings" ask) ──

function toneClause(entry) {
  if (entry.formality === FORMALITY.TV_INFORMAL && entry.informalPronoun) {
    return ` Use the informal form of address (${entry.informalPronoun}), never the formal one.`;
  }
  if (entry.formality === FORMALITY.DEFAULT_CASUAL) {
    return ' Keep the tone casual, warm and friendly — that is the natural everyday register for this language, not a stiff formal one.';
  }
  return ' Keep the tone warm, friendly and moderately casual, the way a helpful staff member would text on WhatsApp — never stiff, bureaucratic or overly formal.';
}

// Builds the forced-language directive (client has a fixed conversation
// language, the default and only mode until matchLeadLanguage is enabled —
// see resolveConversationLang() below). nl/fr/en return their exact legacy
// string untouched; every other language is generated from the registry row.
function buildDirective(code) {
  const entry = getLanguage(code);
  if (entry.legacyDirective) return entry.legacyDirective;
  return `IMPORTANT. Always reply in ${entry.english} (${entry.native}).${toneClause(entry)} Ignore whatever language the lead writes in — always reply in ${entry.english}.`;
}

// Builds the "match the lead's own language" directive — see
// api/whatsapp.js's ctx.matchLeadLanguage. `defaultEntry` is the client's
// configured default (used as the fallback-when-unclear language AND as the
// translation anchor for the escalate phrase below).
function buildMatchDirective(defaultCode) {
  const entry = getLanguage(defaultCode);
  return `IMPORTANT. This client has enabled lead-language matching: look at the lead's most recent message and reply IN THAT LANGUAGE for this turn, translating naturally — don't force ${entry.english}. If the lead's language is unclear, mixed, or you're not confident, default to ${entry.english} (${entry.native}).${toneClause(entry)} At the very end, inside the DECISION JSON block (see below), report which language you actually replied in this turn as "replyLang":"<ISO 639-1 code>" (e.g. "nl", "fr", "de", "es") so the system can localize anything it sends after your turn (like a booking confirmation) in the same language.`;
}

function buildReasonLangNote(code) {
  const entry = getLanguage(code);
  return entry.legacyReasonNote || `in ${entry.english}`;
}

// Match-mode has no single fixed reply language, so the SUMMARY/DECISION
// instructions get a mode-aware note instead of a language name.
const MATCH_REASON_NOTE = 'in whichever language you are replying in this turn';

function buildEscalatePhrase(code) {
  const entry = getLanguage(code);
  return entry.legacyEscalate || entry.escalate;
}

// Match-mode escalate instruction: give Claude the default-language phrase as
// a meaning-anchor and have it translate live into whatever language it's
// using this turn, rather than needing a literal escalate string in 40
// languages up front (Claude is a strong enough multilingual model that this
// is more reliable than a static table for an unbounded target language).
function buildMatchEscalateInstruction(defaultCode) {
  const anchor = buildEscalatePhrase(defaultCode);
  return `Reply with EXACTLY this meaning, translated naturally into the language you are replying in this turn (same tone — warm, short, human): "${anchor}"`;
}

function buildCompletedMessage(code) {
  const entry = getLanguage(code);
  return entry.legacyCompleted || entry.completed;
}

function buildCallbackMessage(code, window) {
  const entry = getLanguage(code);
  const fn = entry.legacyCallback || entry.callback;
  return fn(window);
}

function buildConfirmMessage(code, clientName, when, address) {
  const entry = getLanguage(code);
  const fn = entry.legacyConfirm || entry.confirm;
  return fn(clientName, when, address);
}

function getLocale(code) {
  return getLanguage(code).locale;
}

function isRtl(code) {
  return !!getLanguage(code).rtl;
}

// ── Template-language resolution (Meta approval gate) ───────────────────
// WhatsApp TEMPLATE messages (first contact, appointment booking/reminders,
// nurture follow-ups — see cron-followup.js and leads.js) are a SEPARATE
// system from the free-form AI conversation above: each template is
// registered with Meta PER LANGUAGE and needs its own approval before it can
// be sent in that language. The AI conversation itself has no such
// limitation (Claude can converse in any registry language immediately) —
// only these scripted, pre-approved-copy sends are gated.
//
// Today only nl/fr/en are known-approved template languages — that's what
// every *_TEMPLATE_LANG env var already assumed before this file existed.
// Update this set only once Sindi confirms a new locale variant is approved
// in Meta Business Manager for the templates actually in use
// (FOLLOWUP_TEMPLATE_NAME / REMINDER_TEMPLATE_NAME / BOOKING_TEMPLATE_NAME /
// MANUAL_REPLY_TEMPLATE_NAME). Never silently assume a template exists in a
// language just because the registry supports it for conversation.
const TEMPLATE_APPROVED_LANGUAGES = new Set(['nl', 'fr', 'en']);

// resolveTemplateLanguage(requestedCode, fallbackCode) -> { code, fellBack,
//   requested }. Never returns a language without (assumed) Meta approval —
// falls back to `fallbackCode` if that's approved, else 'nl'. Logs once per
// call when it falls back, so an unapproved language is always visible in
// server logs BEFORE Meta rejects the send outright.
function resolveTemplateLanguage(requestedCode, fallbackCode) {
  const requested = normalizeLanguageCode(requestedCode);
  if (TEMPLATE_APPROVED_LANGUAGES.has(requested)) {
    return { code: requested, fellBack: false, requested };
  }
  const fallback = normalizeLanguageCode(fallbackCode);
  const safeFallback = TEMPLATE_APPROVED_LANGUAGES.has(fallback) ? fallback : 'nl';
  console.warn(`[i18n] Template language '${requested}' has no approved Meta template yet — falling back to '${safeFallback}'. Get this locale variant approved in Meta Business Manager, then add it to TEMPLATE_APPROVED_LANGUAGES in api/_lang.js.`);
  return { code: safeFallback, fellBack: true, requested };
}

module.exports = {
  LANGUAGES,
  SUPPORTED_CODES,
  DEFAULT_CODE,
  FORMALITY,
  normalizeLanguageCode,
  isSupportedLanguage,
  getLanguage,
  listForPicker,
  buildDirective,
  buildMatchDirective,
  buildReasonLangNote,
  MATCH_REASON_NOTE,
  buildEscalatePhrase,
  buildMatchEscalateInstruction,
  buildCompletedMessage,
  buildCallbackMessage,
  buildConfirmMessage,
  getLocale,
  isRtl,
  TEMPLATE_APPROVED_LANGUAGES,
  resolveTemplateLanguage,
};
