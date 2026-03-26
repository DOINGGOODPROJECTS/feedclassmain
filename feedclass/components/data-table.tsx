import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}

type DataTableProps<T> = {
  columns: Column<T>[];
  data?: T[] | null;
  // Backwards-compat: some pages previously used `rows`.
  rows?: T[] | null;
};

export function DataTable<T>({ columns, data, rows }: DataTableProps<T>) {
  const safeRows = Array.isArray(data) ? data : Array.isArray(rows) ? rows : [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.header}>{column.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {safeRows.map((row, index) => (
          <TableRow key={index}>
            {columns.map((column) => (
              <TableCell key={column.header}>{column.render(row)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
