import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { adminApi } from '../../lib/api';
import Link from 'next/link';
import { Card, Badge, Button, Loading, EmptyState } from '../../components/ui';

interface Proof {
  id: string;
  type: string;
  userId: string;
  url: string;
  metadata: any;
  createdAt: string;
}

interface MatchDetail {
  id: string;
  game: string;
  status: string;
  stakeCents: number;
  creator: { id: string; handle: string; email: string };
  accepter: { id: string; handle: string; email: string };
  createdAt: string;
  submittedAt: string;
  disputeDeadline: string;
  chessLink: string;
  proofs: Proof[];
  dispute: any;
  metadata: any;
}

export default function MatchDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (id) loadMatch();
  }, [id]);

  async function loadMatch() {
    setIsLoading(true);
    try {
      const res = await adminApi.getMatch(id as string);
      setMatch(res.data);
    } catch (err) {
      console.error('Failed to load match:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel this match and refund both players?')) return;
    setActionLoading(true);
    try {
      await adminApi.cancelMatch(id as string);
      loadMatch();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleForceSettle(winnerId: string) {
    const winnerName = winnerId === match?.creator.id ? match?.creator.handle : match?.accepter.handle;
    if (!confirm(`Award match to @${winnerName}?`)) return;
    setActionLoading(true);
    try {
      await adminApi.forceSettleMatch(id as string, winnerId);
      loadMatch();
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (isLoading) return <Layout><Loading /></Layout>;
  if (!match) return <Layout><EmptyState title="Match not found" /></Layout>;

  const creatorProofs = match.proofs.filter((p) => p.userId === match.creator.id);
  const accepterProofs = match.proofs.filter((p) => p.userId === match.accepter.id);
  const creatorResult = creatorProofs.find((p) => p.type.includes('RESULT'));
  const accepterResult = accepterProofs.find((p) => p.type.includes('RESULT'));
  const hasConflict = creatorResult && accepterResult && 
    creatorResult.metadata?.result === accepterResult.metadata?.result;

  return (
    <Layout>
      <Link href="/matches" className="back-link">← Back to matches</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Match {match.id.slice(0, 8)}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={match.status as any}>{match.status}</Badge>
            <span className="text-muted">•</span>
            <span className="text-muted">{match.game}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {match.status === 'DISPUTED' && match.dispute && (
            <Link href={`/disputes/${match.dispute.id}`}>
              <Button variant="primary">View Dispute</Button>
            </Link>
          )}
          {['CREATED', 'ACCEPTED', 'FUNDED'].includes(match.status) && (
            <Button variant="danger" onClick={handleCancel} loading={actionLoading}>
              Cancel Match
            </Button>
          )}
        </div>
      </div>

      {/* Match Overview */}
      <Card className="mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-muted text-xs uppercase tracking-wider mb-1">Stake</div>
            <div className="text-2xl font-bold">${(match.stakeCents / 100).toFixed(0)}</div>
            <div className="text-muted text-sm">each player</div>
          </div>
          <div>
            <div className="text-muted text-xs uppercase tracking-wider mb-1">Total Pot</div>
            <div className="text-2xl font-bold text-success">${((match.stakeCents * 2) / 100).toFixed(0)}</div>
            <div className="text-muted text-sm">winner takes ~95%</div>
          </div>
          <div>
            <div className="text-muted text-xs uppercase tracking-wider mb-1">Created</div>
            <div className="text-lg font-medium">{new Date(match.createdAt).toLocaleDateString()}</div>
            <div className="text-muted text-sm">{new Date(match.createdAt).toLocaleTimeString()}</div>
          </div>
          <div>
            <div className="text-muted text-xs uppercase tracking-wider mb-1">Status</div>
            <Badge variant={match.status as any}>{match.status}</Badge>
            {match.disputeDeadline && (
              <div className="text-muted text-sm mt-1">
                Deadline: {new Date(match.disputeDeadline).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Players */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Creator */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-lg">
                👤
              </div>
              <div>
                <div className="font-bold text-lg">@{match.creator.handle}</div>
                <div className="text-muted text-sm">{match.creator.email}</div>
              </div>
            </div>
            <Badge variant="created">Creator</Badge>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <div className="text-muted text-xs uppercase tracking-wider mb-3">Submissions</div>
            {creatorProofs.length === 0 ? (
              <div className="text-muted text-sm italic">No submissions yet</div>
            ) : (
              <div className="space-y-2">
                {creatorProofs.map((p) => (
                  <div key={p.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.type}</span>
                      <span className="text-muted text-xs">{new Date(p.createdAt).toLocaleTimeString()}</span>
                    </div>
                    {p.metadata?.result && (
                      <div className="mt-1">
                        Result: <span className={p.metadata.result === 'I_WON' ? 'text-success' : 'text-danger'}>
                          {p.metadata.result}
                        </span>
                      </div>
                    )}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener" className="text-blue-400 text-sm hover:underline">
                        View Proof →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Accepter */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-lg">
                👤
              </div>
              <div>
                <div className="font-bold text-lg">@{match.accepter.handle}</div>
                <div className="text-muted text-sm">{match.accepter.email}</div>
              </div>
            </div>
            <Badge variant="accepted">Accepter</Badge>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <div className="text-muted text-xs uppercase tracking-wider mb-3">Submissions</div>
            {accepterProofs.length === 0 ? (
              <div className="text-muted text-sm italic">No submissions yet</div>
            ) : (
              <div className="space-y-2">
                {accepterProofs.map((p) => (
                  <div key={p.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.type}</span>
                      <span className="text-muted text-xs">{new Date(p.createdAt).toLocaleTimeString()}</span>
                    </div>
                    {p.metadata?.result && (
                      <div className="mt-1">
                        Result: <span className={p.metadata.result === 'I_WON' ? 'text-success' : 'text-danger'}>
                          {p.metadata.result}
                        </span>
                      </div>
                    )}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener" className="text-blue-400 text-sm hover:underline">
                        View Proof →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Conflict Warning */}
      {hasConflict && (
        <Card className="border-2 border-red-500 mb-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">⚠️</div>
            <div className="flex-1">
              <h3 className="text-red-400 font-bold text-lg mb-2">Conflict Detected</h3>
              <p className="text-muted mb-4">
                Both players submitted conflicting results. Both claimed "{creatorResult?.metadata?.result}". 
                This requires manual review to determine the actual winner.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="success" 
                  onClick={() => handleForceSettle(match.creator.id)}
                  loading={actionLoading}
                >
                  Award to @{match.creator.handle}
                </Button>
                <Button 
                  variant="success" 
                  onClick={() => handleForceSettle(match.accepter.id)}
                  loading={actionLoading}
                >
                  Award to @{match.accepter.handle}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Admin Actions */}
      {['SUBMITTED', 'DISPUTED', 'IN_PROGRESS'].includes(match.status) && (
        <Card title="Admin Actions">
          <div className="flex flex-wrap gap-3">
            <Button 
              variant="success" 
              onClick={() => handleForceSettle(match.creator.id)}
              loading={actionLoading}
            >
              🏆 Award to @{match.creator.handle}
            </Button>
            <Button 
              variant="success" 
              onClick={() => handleForceSettle(match.accepter.id)}
              loading={actionLoading}
            >
              🏆 Award to @{match.accepter.handle}
            </Button>
          </div>
        </Card>
      )}
    </Layout>
  );
}
