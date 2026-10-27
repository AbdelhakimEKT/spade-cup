import {
  franceOffset,
  initialsOf,
  isAllowedLogo,
  normalizeDate,
  normalizeTime,
  posterQuery,
} from './poster';

describe('affiche : mise en forme', () => {
  it('date : « 26-10 », « 26.10 », « 6/1 » deviennent « 26/10 », « 06/01 »', () => {
    expect(normalizeDate('26-10')).toBe('26/10');
    expect(normalizeDate('26.10')).toBe('26/10');
    expect(normalizeDate(' 6/1 ')).toBe('06/01');
    expect(normalizeDate('32/10')).toBeNull();
    expect(normalizeDate('26/13')).toBeNull();
    expect(normalizeDate('demain')).toBeNull();
  });

  it('heure : « 22h », « 22:00 », « 21h30 », « 9H » → « 22H00 », « 21H30 », « 09H00 »', () => {
    expect(normalizeTime('22h')).toBe('22H00');
    expect(normalizeTime('22:00')).toBe('22H00');
    expect(normalizeTime('21h30')).toBe('21H30');
    expect(normalizeTime('9H')).toBe('09H00');
    expect(normalizeTime('22')).toBe('22H00');
    expect(normalizeTime('25h')).toBeNull();
    expect(normalizeTime('22h75')).toBeNull();
  });

  it('heure française : UTC+1 l’hiver, UTC+2 l’été, au bon jour près', () => {
    const now = new Date(Date.UTC(2026, 9, 27));
    expect(franceOffset('26/10', now)).toBe('UTC+1'); // lendemain du passage à l'heure d'hiver
    expect(franceOffset('24/10', now)).toBe('UTC+2'); // la veille : encore l'heure d'été
    expect(franceOffset('15/07', now)).toBe('UTC+2'); // l'été prochain
    expect(franceOffset('05/01', now)).toBe('UTC+1');
  });

  it('logos : seulement ceux hébergés par Discord, en https', () => {
    expect(isAllowedLogo('https://cdn.discordapp.com/attachments/1/2/logo.png?ex=1')).toBe(true);
    expect(isAllowedLogo('https://media.discordapp.net/attachments/1/2/logo.webp')).toBe(true);
    expect(isAllowedLogo('http://cdn.discordapp.com/x.png')).toBe(false);
    expect(isAllowedLogo('https://evil.example/logo.png')).toBe(false);
    expect(isAllowedLogo('pas une adresse')).toBe(false);
    expect(isAllowedLogo(undefined)).toBe(false);
  });

  it('adresse de l’affiche : tous les champs, encodés', () => {
    const q = new URLSearchParams(
      posterQuery({
        leftName: 'Clash Invaders',
        leftLogo: 'https://cdn.discordapp.com/a.png?ex=1&is=2',
        rightName: 'Spartiates',
        rightLogo: 'https://cdn.discordapp.com/b.png',
        format: '5v5',
        date: '26/10',
        time: '22H00',
        rules: 'Esport — BO3',
      }),
    );
    expect(q.get('gl')).toBe('https://cdn.discordapp.com/a.png?ex=1&is=2');
    expect(q.get('r')).toBe('Esport — BO3');
    expect(q.get('d')).toBe('Spartiates');
  });

  it('initiales de secours', () => {
    expect(initialsOf('Clash Invaders')).toBe('CI');
    expect(initialsOf('Spartiates')).toBe('SP');
  });
});
