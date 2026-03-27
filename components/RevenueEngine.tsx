import React from 'react';

const mockRevenue = {
  total: 120000,
  pending: 15000,
  deals: [
    { id: 'D-001', client: 'Acme Corp', amount: 50000, commission: 5000, status: 'Paid' },
    { id: 'D-002', client: 'Beta LLC', amount: 30000, commission: 3000, status: 'Pending' },
    { id: 'D-003', client: 'Gamma Inc', amount: 40000, commission: 7000, status: 'Pending' },
  ],
};

const RevenueEngine = () => (
  <div className="bg-white rounded-2xl p-8 border border-[#E5EAF2] shadow max-w-2xl mx-auto mt-8">
    <h2 className="text-xl font-semibold text-[#0F172A] mb-6">Revenue Engine</h2>
    <div className="flex gap-8 mb-8">
      <div>
        <div className="text-[#64748B] text-xs">Revenue Generated</div>
        <div className="text-2xl font-bold text-[#2563EB]">${mockRevenue.total.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[#64748B] text-xs">Pending Commissions</div>
        <div className="text-2xl font-bold text-[#F59E42]">${mockRevenue.pending.toLocaleString()}</div>
      </div>
    </div>
    <div className="mb-4 text-[#0F172A] font-semibold">Deal Tracking</div>
    <table className="w-full text-sm mb-4">
      <thead>
        <tr className="text-[#64748B]">
          <th className="text-left py-2">Deal ID</th>
          <th className="text-left py-2">Client</th>
          <th className="text-right py-2">Amount</th>
          <th className="text-right py-2">Commission</th>
          <th className="text-center py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {mockRevenue.deals.map((d) => (
          <tr key={d.id} className="border-t border-[#E5EAF2]">
            <td className="py-2">{d.id}</td>
            <td className="py-2">{d.client}</td>
            <td className="py-2 text-right">${d.amount.toLocaleString()}</td>
            <td className="py-2 text-right text-[#2563EB]">${d.commission.toLocaleString()}</td>
            <td className={`py-2 text-center ${d.status === 'Paid' ? 'text-[#22C55E]' : 'text-[#F59E42]'}`}>{d.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default RevenueEngine;
