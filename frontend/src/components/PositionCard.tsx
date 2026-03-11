import type { JSX } from 'preact';
import type { PositionListItem } from '../api/positions';

function formatCurrency(value: string): string {
  return `$${parseFloat(value).toFixed(2)}`;
}

type Props = {
  item: PositionListItem;
};

export function PositionCard({ item }: Props): JSX.Element {
  return (
    <article>
      <h2>{item.ticker}</h2>
      <span className={`phase-badge phase-${item.phase.toLowerCase()}`}>{item.phase}</span>
      <dl>
        <dt>Strike</dt>
        <dd>{item.strike ? formatCurrency(item.strike) : '—'}</dd>
        <dt>Expiration</dt>
        <dd>{item.expiration ?? '—'}</dd>
        <dt>DTE</dt>
        <dd>{item.dte !== null ? `${item.dte}d` : 'Expired'}</dd>
        <dt>Premium Collected</dt>
        <dd>{formatCurrency(item.premium_collected)}</dd>
        <dt>Effective Cost Basis</dt>
        <dd>{formatCurrency(item.effective_cost_basis)}</dd>
      </dl>
    </article>
  );
}
