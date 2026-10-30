'use client';

import * as React from 'react';
import { Flag, CheckCircle2, XCircle, Search, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Server, ReportItem } from '@/lib/types/server';
import { ToastItem } from '@/components/ui/toast';

interface ReportsTabProps {
  server: Server;
  reports: ReportItem[];
  loading: boolean;
  canManageReports: boolean;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onResolveReport: (reportId: string, actionTaken?: string) => Promise<unknown>;
  onDismissReport: (reportId: string) => Promise<unknown>;
}

export function ReportsTab({
  server,
  reports,
  loading,
  canManageReports,
  toast,
  onResolveReport,
  onDismissReport,
}: ReportsTabProps) {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('pending');
  const [actingReportId, setActingReportId] = React.useState<string | null>(null);

  const filteredReports = reports.filter((report) => {
    const matchesStatus =
      statusFilter === 'all' || (report.status || 'pending') === statusFilter;
    const reporterName =
      report.reporter?.display_name || report.reporter?.username || '';
    const reportedName =
      report.reported_user?.display_name || report.reported_user?.username || '';
    const reason = report.reason || '';
    const matchesSearch =
      reporterName.toLowerCase().includes(search.toLowerCase()) ||
      reportedName.toLowerCase().includes(search.toLowerCase()) ||
      reason.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const handleResolve = async (reportId: string) => {
    setActingReportId(reportId);
    try {
      await onResolveReport(reportId, 'Resolved by moderator in Server Settings');
      toast({
        title: 'Report Resolved',
        description: 'The incident has been marked as resolved.',
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Action Failed',
        description: (err as Error)?.message || 'Failed to resolve report.',
        type: 'error',
      });
    } finally {
      setActingReportId(null);
    }
  };

  const handleDismiss = async (reportId: string) => {
    setActingReportId(reportId);
    try {
      await onDismissReport(reportId);
      toast({
        title: 'Report Dismissed',
        description: 'The incident report has been dismissed.',
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Action Failed',
        description: (err as Error)?.message || 'Failed to dismiss report.',
        type: 'error',
      });
    } finally {
      setActingReportId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">User Reports</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review community reports filed against server members and content.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports by user or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reports ({reports.length})</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading server reports...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            {reports.length === 0
              ? 'No reports have been filed in this server.'
              : 'No reports match your current filter.'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {filteredReports.map((report) => {
              const reporterName =
                report.reporter?.display_name || report.reporter?.username || 'Anonymous';
              const reportedName =
                report.reported_user?.display_name || report.reported_user?.username || 'Reported User';
              const isPending = (report.status || 'pending') === 'pending';
              const isActing = actingReportId === report.id;

              return (
                <div
                  key={report.id}
                  className="p-3.5 rounded-xl border border-border bg-card/40 hover:bg-card/70 transition-colors space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Flag className="w-4 h-4 text-destructive shrink-0" />
                        <span className="text-xs font-semibold text-foreground">
                          {reporterName} reported {reportedName}
                        </span>
                        <Badge
                          variant={isPending ? 'destructive' : 'outline'}
                          className="text-xs uppercase font-mono"
                        >
                          {report.status || 'pending'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        {report.reason || 'No detailed reason specified.'}
                      </p>
                    </div>

                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {canManageReports && isPending && (
                    <div className="flex justify-end gap-2 pt-1 border-t border-border/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isActing}
                        onClick={() => handleDismiss(report.id)}
                        className="text-xs h-7 text-muted-foreground hover:text-foreground"
                      >
                        Dismiss
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isActing}
                        onClick={() => handleResolve(report.id)}
                        className="text-xs h-7 gap-1"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Mark Resolved
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
