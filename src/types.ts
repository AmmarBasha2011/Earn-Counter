export interface Product {
  id: string;
  name: string;
  purchasePrice: number;
}

export interface Affiliate {
  id: string;
  name: string;
  percentage: number;
}

export interface InvoiceItem {
  id: string;
  name: string;
  sellingPrice: number;
  purchasePrice: number;
  quantity: number;
}

export interface SavedInvoice {
  id: string;
  date: string;
  items: InvoiceItem[];
  totalProfit: number;
  affiliateId?: string;
  affiliateName?: string;
  affiliateShare?: number;
  image?: string;
}
