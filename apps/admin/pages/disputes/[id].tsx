import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { adminApi } from '../../lib/api';
import Link from 'next/link';

export default function DisputeDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [dispute, setDispute] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [decision, setDecision] = useState<'UPHELD' | 'DENIED'>('DENIED');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) loadDispute();
  }, [id]);

  async function loadDispute() {
    try {
      const res = await adminApi.getDispute(id);
      setDispute(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || reason.length < 10) {
      setError('Please provide a detailed reason (min 10 characters)');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await adminApi.resolveDispute(id, decision, reason);
      await loadDispute();
      alert(`Dispute resolved: ${decision}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <Layout><div style={{ color: 'var(--text-secondary)' }}>Loading...</div></Layout>;
  }

  if (!dispute) {
    return (
      <Layout>
        <div style={{ color: 'var(--danger)' }}>{error || 'Dispute not found'}</div>
      </Layout>
    );
  }

  const match = dispute.match;
  const potCents = match.stakeCents * 2;

  return (
    <Layout>
      <div>
        <Link href="/disputes" className="back-link">
          ← Back to Disputes
        </Link>

        <div className="page-header">
          <h1 className="page-title">Dispute Review</h1>
          <span className={`badge badge-${dispute.status.toLowerCase()}`}>
            {dispute.status}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {/* Match Info */}
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Match Details</h3>
            <table style={{ width: '100%' }}>
              <tbody>
                {[
                  ['Match ID', match.id.slice(0, 12) + '...'],
                  ['Game', `${match.game}${match.platform ? ` (${match.platform})` : ''}`],
                  ['Mode', match.template?.name ?? 'Standard'],
                  ['Stake (each)', `$${(match.stakeCents / 100).toFixed(2)}`],
                  ['Total Pot', `$${(potCents / 100).toFixed(2)}`],
                  ['Match Status', match.status],
                ].map(([label, value]) => (
                  <tr key={label as string}>
                    <td style={{ color: 'var(--text-secondary)', padding: '6px 0', paddingRight: '20px', fontSize: '13px' }}>
                      {label}
                    </td>
                    <td style={{ fontWeight: 500, fontSize: '13px' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Players Info */}
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Players</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <PlayerCard
                handle={match.creator.handle}
                email={match.creator.email}
                role="Creator"
                isDisputer={dispute.openedById === match.creator.id}
              />
              {match.accepter && (
                <PlayerCard
                  handle={match.accepter.handle}
                  email={match.accepter.email}
                  role="Accepter"
                  isDisputer={dispute.openedById === match.accepter.id}
                />
              )}
            </div>

            <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Dispute Bond</div>
              <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '18px' }}>
                ${(dispute.bondCents / 100).toFixed(2)}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                Locked from disputer's wallet
              </div>
            </div>
          </div>
        </div>

        {/* Dispute Details */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontWeight: 700, marginBottom: '12px' }}>Dispute Reason</h3>
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '14px', lineHeight: 1.6 }}>
            "{dispute.reason}"
          </p>
          <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
            Filed: {new Date(dispute.createdAt).toLocaleString()}
          </div>
        </div>

        {/* Proof Evidence */}
        {match.proofs && match.proofs.length > 0 && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Proof Evidence ({match.proofs.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
              {match.proofs.map((proof: any) => (
                <div
                  key={proof.id}
                  style={{ background: 'var(--bg)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                    }}>
                      {proof.type}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {proof.userId === match.creator.id ? `@${match.creator.handle}` : `@${match.accepter?.handle}`}
                    </span>
                  </div>

                  {proof.type.includes('RESULT') && proof.metadata && (
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{
                        fontWeight: 700,
                        color: (proof.metadata as any).result === 'I_WON' ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {(proof.metadata as any).result}
                      </span>
                      {(proof.metadata as any).myScore !== undefined && (
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '12px' }}>
                          {(proof.metadata as any).myScore} - {(proof.metadata as any).opponentScore}
                        </span>
                      )}
                    </div>
                  )}

                  {proof.url && (
                    <a
                      href={proof.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--info)',
                        fontSize: '12px',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {proof.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolution Form */}
        {dispute.status === 'OPEN' && (
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Resolve Dispute</h3>

            {error && (
              <div style={{
                background: '#EF444422',
                border: '1px solid #EF444444',
                borderRadius: '7px',
                padding: '10px 12px',
                color: '#EF4444',
                marginBottom: '16px',
                fontSize: '13px',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleResolve}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '12px 16px',
                  border: `2px solid ${decision === 'UPHELD' ? '#4ADE80' : 'var(--border)'}`,
                  borderRadius: '8px',
                  flex: 1,
                  background: decision === 'UPHELD' ? '#4ADE8011' : 'var(--bg)',
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: decision === 'UPHELD' ? '#4ADE80' : 'var(--text-secondary)',
                }}>
                  <input
                    type="radio"
                    value="UPHELD"
                    checked={decision === 'UPHELD'}
                    onChange={() => setDecision('UPHELD')}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  UPHELD — Dispute Valid
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '12px 16px',
                  border: `2px solid ${decision === 'DENIED' ? '#EF4444' : 'var(--border)'}`,
                  borderRadius: '8px',
                  flex: 1,
                  background: decision === 'DENIED' ? '#EF444411' : 'var(--bg)',
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: decision === 'DENIED' ? '#EF4444' : 'var(--text-secondary)',
                }}>
                  <input
                    type="radio"
                    value="DENIED"
                    checked={decision === 'DENIED'}
                    onChange={() => setDecision('DENIED')}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  DENIED — Dispute Invalid
                </label>
              </div>

              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}>
                {decision === 'UPHELD' ? (
                  <>
                    <strong style={{ color: '#4ADE80' }}>UPHELD consequences:</strong><br />
                    • Disputer's bond (${(dispute.bondCents / 100).toFixed(2)}) returned to their AVAILABLE<br />
                    • If result is reversed, correct winner gets payout
                  </>
                ) : (
                  <>
                    <strong style={{ color: '#EF4444' }}>DENIED consequences:</strong><br />
                    • Disputer's bond (${(dispute.bondCents / 100).toFixed(2)}) forfeited to opponent<br />
                    • Original result stands, winner gets payout
                  </>
                )}
              </div>

              <div className="form-group">
                <label>Admin Reason / Notes</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain your decision... (min 10 characters)"
                  rows={4}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Link href="/disputes" className="btn btn-secondary">
                  Cancel
                </Link>
                <button
                  type="submit"
                  className={`btn ${decision === 'UPHELD' ? 'btn-success' : 'btn-danger'}`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : `Resolve as ${decision}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Resolved State */}
        {dispute.status === 'RESOLVED' && (
          <div className="card" style={{ borderColor: dispute.decision === 'UPHELD' ? '#4ADE8044' : '#EF444444' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '12px', color: dispute.decision === 'UPHELD' ? '#4ADE80' : '#EF4444' }}>
              Resolved: {dispute.decision}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
              {dispute.reason}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
              Resolved: {new Date(dispute.resolvedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

function PlayerCard({
  handle,
  email,
  role,
  isDisputer,
}: {
  handle: string;
  email?: string;
  role: string;
  isDisputer?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px',
      background: 'var(--bg)',
      borderRadius: '8px',
      border: `1px solid ${isDisputer ? '#EF444444' : 'var(--border)'}`,
    }}>
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '18px',
        background: isDisputer ? '#EF444422' : 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '16px',
        color: isDisputer ? '#EF4444' : 'var(--text)',
      }}>
        {handle[0].toUpperCase()}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>
          @{handle}
          {isDisputer && (
            <span style={{
              marginLeft: '8px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#EF4444',
              background: '#EF444422',
              padding: '1px 6px',
              borderRadius: '3px',
            }}>
              DISPUTER
            </span>
          )}
        </div>
        {email && <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{email}</div>}
        <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{role}</div>
      </div>
    </div>
  );
}
