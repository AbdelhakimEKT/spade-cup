import { friendlyWar } from '../../../testing/fixtures';
import { FW_TEAM_COLORS, fwTeamColor, orderFw } from './fw-teams';

describe('fw-teams', () => {
  it('team 1 en violet, team 2 en vert, un autre clan sans couleur', () => {
    expect(fwTeamColor('#2CYJPRCG8')).toBe('violet');
    expect(fwTeamColor('#2JVUP2PGC')).toBe('green');
    expect(fwTeamColor('#2PPP')).toBeNull();
    expect(FW_TEAM_COLORS).toEqual({ '#2CYJPRCG8': 'violet', '#2JVUP2PGC': 'green' });
  });

  it('remet team 1 à gauche même si elle a été enregistrée « extérieur »', () => {
    const { left, right, winner } = orderFw(friendlyWar()); // domicile = FW-team2
    expect([left.name, right.name]).toEqual(['FW-team1', 'FW-team2']);
    expect(winner?.name).toBe('FW-team2');
    expect([left.won, right.won]).toEqual([false, true]);
  });

  it('égalité parfaite : pas de gagnant', () => {
    expect(orderFw({ ...friendlyWar(), winner: null }).winner).toBeNull();
  });
});
