/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  FileText, 
  Save, 
  History, 
  ChevronLeft, 
  Camera, 
  Loader2,
  AlertCircle,
  Edit2,
  DollarSign,
  Package,
  Search,
  Users,
  UserPlus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI, Type } from '@google/genai';
import { cn } from './lib/utils';
import { Product, InvoiceItem, SavedInvoice, Affiliate } from './types';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [view, setView] = useState<'home' | 'products' | 'analyze' | 'history' | 'affiliates'>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<InvoiceItem[] | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductPrice, setEditingProductPrice] = useState<string>('');

  // Search and selection states
  const [productSearch, setProductSearch] = useState('');
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string>('');

  // Load data from LocalStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('products');
    const savedInvoices = localStorage.getItem('invoices');
    const savedAffiliates = localStorage.getItem('affiliates');
    if (savedProducts) setProducts(JSON.parse(savedProducts));
    if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
    if (savedAffiliates) setAffiliates(JSON.parse(savedAffiliates));
    
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }, []);

  // Save data to LocalStorage
  useEffect(() => { localStorage.setItem('products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('invoices', JSON.stringify(invoices)); }, [invoices]);
  useEffect(() => { localStorage.setItem('affiliates', JSON.stringify(affiliates)); }, [affiliates]);

  const updateProductPrice = (id: string, newPrice: number) => {
    setProducts(products.map(p => p.id === id ? { ...p, purchasePrice: newPrice } : p));
    setEditingProductId(null);
  };

  const addProduct = (name: string, price: number) => {
    setProducts([...products, { id: crypto.randomUUID(), name, purchasePrice: price }]);
  };

  const addAffiliate = (name: string, percentage: number) => {
    setAffiliates([...affiliates, { id: crypto.randomUUID(), name, percentage }]);
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      setTempImage(base64Data);
      analyzeInvoice(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  } as any);

  const analyzeInvoice = async (base64Image: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const model = "gemini-3-flash-preview";
      const productList = products.map(p => p.name).join(', ');
      const prompt = `حلل صورة الفاتورة هذه واستخرج قائمة بالمنتجات. لكل منتج، استخرج الاسم وسعر البيع والكمية. 
      لديك قائمة بالمنتجات المسجلة مسبقاً: [${productList}]. حاول مطابقة الأسماء في الفاتورة مع هذه القائمة.
      ملاحظة هامة: إذا وجدت بنوداً مثل "الكلارك" أو "كلارك" أو "نقل" أو "النقل" أو "توصيل"، استخرجها أيضاً. هذه البنود تعتبر خدمات أو تكاليف إضافية وليس لها ربح (سعر الشراء يساوي سعر البيع).
      أريد النتيجة بتنسيق JSON فقط كمصفوفة من الكائنات:
      [{"name": "اسم المنتج", "sellingPrice": 10.5, "quantity": 1}]
      تأكد من أن الأسماء باللغة العربية كما هي في الفاتورة.`;

      const result = await genAI.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                sellingPrice: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER }
              },
              required: ["name", "sellingPrice", "quantity"]
            }
          }
        }
      });

      const extractedItems = JSON.parse(result.text || '[]');
      const itemsWithPurchasePrice = extractedItems.map((item: any) => {
        const isSpecialItem = /الكلارك|كلارك|نقل|النقل|توصيل/.test(item.name);
        const matchedProduct = products.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(p.name.toLowerCase()));
        let purchasePrice = matchedProduct ? matchedProduct.purchasePrice : 0;
        if (isSpecialItem) purchasePrice = item.sellingPrice;
        return { id: crypto.randomUUID(), name: item.name, sellingPrice: item.sellingPrice, purchasePrice, quantity: item.quantity || 1 };
      });

      setAnalysisResult(itemsWithPurchasePrice);
      setView('analyze');
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء تحليل الصورة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveInvoice = () => {
    if (!analysisResult) return;
    const totalProfit = analysisResult.reduce((sum, item) => sum + ((item.sellingPrice - item.purchasePrice) * item.quantity), 0);
    const affiliate = affiliates.find(a => a.id === selectedAffiliateId);
    const affiliateShare = affiliate ? (totalProfit * (affiliate.percentage / 100)) : 0;

    if (editingInvoiceId) {
      // Update existing invoice
      setInvoices(invoices.map(inv => inv.id === editingInvoiceId ? {
        ...inv,
        items: analysisResult,
        totalProfit,
        affiliateId: affiliate?.id,
        affiliateName: affiliate?.name,
        affiliateShare,
      } : inv));
    } else {
      // Create new invoice
      const newInvoice: SavedInvoice = {
        id: crypto.randomUUID(),
        date: new Date().toLocaleString('ar-EG'),
        items: analysisResult,
        totalProfit,
        affiliateId: affiliate?.id,
        affiliateName: affiliate?.name,
        affiliateShare,
        image: tempImage || undefined
      };
      setInvoices([newInvoice, ...invoices]);
    }

    setAnalysisResult(null);
    setEditingInvoiceId(null);
    setTempImage(null);
    setSelectedAffiliateId('');
    setView('history');
  };

  const editInvoice = (invoice: SavedInvoice) => {
    setAnalysisResult(invoice.items);
    setEditingInvoiceId(invoice.id);
    setSelectedAffiliateId(invoice.affiliateId || '');
    setView('analyze');
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    if (!analysisResult) return;
    setAnalysisResult(analysisResult.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: string) => {
    if (!analysisResult) return;
    setAnalysisResult(analysisResult.filter(item => item.id !== id));
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans rtl pb-24">
      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 px-4 py-3 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <NavButton active={view === 'home'} onClick={() => { setView('home'); setAnalysisResult(null); setEditingInvoiceId(null); }} icon={<FileText size={22} />} label="الرئيسية" />
          <NavButton active={view === 'products'} onClick={() => { setView('products'); setAnalysisResult(null); setEditingInvoiceId(null); }} icon={<Package size={22} />} label="المنتجات" />
          <NavButton active={view === 'affiliates'} onClick={() => { setView('affiliates'); setAnalysisResult(null); setEditingInvoiceId(null); }} icon={<Users size={22} />} label="الشركاء" />
          <NavButton active={view === 'history'} onClick={() => { setView('history'); setAnalysisResult(null); setEditingInvoiceId(null); }} icon={<History size={22} />} label="السجل" />
        </div>
      </nav>

      <main className="pt-6 px-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <header className="text-center py-6">
                <h1 className="text-3xl font-bold text-blue-500 mb-1">المحاسب الذكي</h1>
                <p className="text-slate-400 text-sm">إدارة مبيعاتك وأرباحك بذكاء</p>
              </header>

              <div {...getRootProps()} className={cn("border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer", isDragActive ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700")}>
                <input {...getInputProps()} />
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4 text-blue-500">
                  {isAnalyzing ? <Loader2 className="animate-spin" size={32} /> : <Camera size={32} />}
                </div>
                <p className="text-lg font-semibold">{isAnalyzing ? "جاري التحليل..." : "ارفع صورة الفاتورة"}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <QuickStat label="إجمالي الأرباح" value={`${invoices.reduce((s, i) => s + i.totalProfit, 0).toFixed(2)}`} icon={<DollarSign className="text-green-500" size={18} />} />
                <QuickStat label="الفواتير" value={`${invoices.length}`} icon={<FileText className="text-blue-500" size={18} />} />
              </div>
            </motion.div>
          )}

          {view === 'products' && (
            <motion.div key="products" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">المنتجات</h2>
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-800 rounded-full"><ChevronLeft size={24} /></button>
              </div>

              <AddProductForm onAdd={addProduct} />

              <div className="relative">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input 
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pr-12 pl-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="بحث عن منتج..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {filteredProducts.map(product => (
                  <div key={product.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                    <div className="flex-1">
                      <h3 className="font-semibold">{product.name}</h3>
                      {editingProductId === product.id ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input 
                            type="number"
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs w-24 outline-none focus:ring-1 focus:ring-blue-500"
                            value={editingProductPrice}
                            onChange={(e) => setEditingProductPrice(e.target.value)}
                            autoFocus
                          />
                          <button 
                            onClick={() => updateProductPrice(product.id, parseFloat(editingProductPrice) || 0)}
                            className="p-1 text-green-500 hover:bg-green-500/10 rounded"
                          >
                            <Save size={14} />
                          </button>
                          <button 
                            onClick={() => setEditingProductId(null)}
                            className="p-1 text-slate-500 hover:bg-slate-500/10 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-slate-400">شراء: {product.purchasePrice} ج.م</p>
                          <button 
                            onClick={() => {
                              setEditingProductId(product.id);
                              setEditingProductPrice(product.purchasePrice.toString());
                            }}
                            className="p-1 text-blue-400 hover:bg-blue-400/10 rounded"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setProducts(products.filter(p => p.id !== product.id))} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl"><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'affiliates' && (
            <motion.div key="affiliates" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">الشركاء / المسوقين</h2>
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-800 rounded-full"><ChevronLeft size={24} /></button>
              </div>

              <AddAffiliateForm onAdd={addAffiliate} />

              <div className="space-y-2">
                {affiliates.map(affiliate => (
                  <div key={affiliate.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold">{affiliate.name}</h3>
                      <p className="text-xs text-slate-400">النسبة: {affiliate.percentage}%</p>
                    </div>
                    <button onClick={() => setAffiliates(affiliates.filter(a => a.id !== affiliate.id))} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl"><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'analyze' && analysisResult && (
            <motion.div key="analyze" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">مراجعة الفاتورة</h2>
                <button onClick={() => { setAnalysisResult(null); setEditingInvoiceId(null); setView('home'); }} className="p-2 hover:bg-slate-800 rounded-full"><ChevronLeft size={24} /></button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <label className="text-sm font-semibold block">اختر الشريك (اختياري)</label>
                <select 
                  className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-sm outline-none"
                  value={selectedAffiliateId}
                  onChange={(e) => setSelectedAffiliateId(e.target.value)}
                >
                  <option value="">بدون شريك</option>
                  {affiliates.map(a => <option key={a.id} value={a.id}>{a.name} ({a.percentage}%)</option>)}
                </select>
              </div>

              <div className="space-y-3">
                {analysisResult.map(item => (
                  <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <input 
                        className="bg-transparent border-none focus:ring-0 p-0 font-bold text-base w-full"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                      />
                      <button onClick={() => removeItem(item.id)} className="text-red-500 p-1"><X size={18} /></button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <InputGroup label="البيع" value={item.sellingPrice} onChange={(v) => updateItem(item.id, 'sellingPrice', v)} />
                      <InputGroup label="الشراء" value={item.purchasePrice} onChange={(v) => updateItem(item.id, 'purchasePrice', v)} />
                      <InputGroup label="الكمية" value={item.quantity} onChange={(v) => updateItem(item.id, 'quantity', v)} />
                    </div>

                    <div className="flex justify-between text-xs font-bold pt-2 border-t border-slate-800">
                      <span className="text-slate-400">الربح الفرعي:</span>
                      <span className={cn((item.sellingPrice - item.purchasePrice) >= 0 ? "text-green-500" : "text-red-500")}>
                        {((item.sellingPrice - item.purchasePrice) * item.quantity).toFixed(2)} ج.م
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">إجمالي الربح:</span>
                  <span className="font-bold text-green-500">
                    {analysisResult.reduce((sum, item) => sum + ((item.sellingPrice - item.purchasePrice) * item.quantity), 0).toFixed(2)} ج.م
                  </span>
                </div>
                {selectedAffiliateId && (
                  <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-2">
                    <span className="text-slate-400">نصيب الشريك:</span>
                    <span className="font-bold text-blue-400">
                      {(analysisResult.reduce((sum, item) => sum + ((item.sellingPrice - item.purchasePrice) * item.quantity), 0) * (affiliates.find(a => a.id === selectedAffiliateId)?.percentage || 0) / 100).toFixed(2)} ج.م
                    </span>
                  </div>
                )}
                <button onClick={saveInvoice} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 mt-2 transition-all">
                  <Save size={20} /> {editingInvoiceId ? "تحديث الفاتورة" : "حفظ الفاتورة"}
                </button>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">السجل</h2>
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-800 rounded-full"><ChevronLeft size={24} /></button>
              </div>

              <div className="space-y-3">
                {invoices.map(invoice => (
                  <div key={invoice.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] text-slate-500">{invoice.date}</p>
                        <h3 className="font-bold text-sm">فاتورة #{invoice.id.slice(0, 8)}</h3>
                        {invoice.affiliateName && <p className="text-[10px] text-blue-400">شريك: {invoice.affiliateName}</p>}
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] text-slate-500">الربح الإجمالي</p>
                        <p className="text-lg font-bold text-green-500">{invoice.totalProfit.toFixed(2)}</p>
                        {invoice.affiliateShare ? (
                          <p className="text-[10px] text-orange-400">الصافي: {(invoice.totalProfit - invoice.affiliateShare).toFixed(2)}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-800">
                      <button onClick={() => editInvoice(invoice)} className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-500 text-xs py-2 rounded-lg flex items-center justify-center gap-1"><Edit2 size={14} /> تعديل</button>
                      <button onClick={() => setInvoices(invoices.filter(i => i.id !== invoice.id))} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-1 transition-all", active ? "text-blue-500 scale-105" : "text-slate-500")}>
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

function QuickStat({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-slate-500">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function InputGroup({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-slate-500 block">{label}</label>
      <input 
        type="number" 
        className="w-full bg-slate-800 border-none rounded-lg px-2 py-2 text-xs outline-none"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function AddProductForm({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
      <input className="w-full bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none" placeholder="اسم المنتج..." value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" className="w-full bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none" placeholder="سعر الشراء..." value={price} onChange={(e) => setPrice(e.target.value)} />
      <button onClick={() => { if(name && price) { onAdd(name, parseFloat(price)); setName(''); setPrice(''); } }} className="w-full bg-blue-600 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2"><Plus size={16} /> إضافة</button>
    </div>
  );
}

function AddAffiliateForm({ onAdd }: { onAdd: (name: string, percentage: number) => void }) {
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState('');
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
      <input className="w-full bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none" placeholder="اسم الشريك..." value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" className="w-full bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none" placeholder="النسبة %..." value={percentage} onChange={(e) => setPercentage(e.target.value)} />
      <button onClick={() => { if(name && percentage) { onAdd(name, parseFloat(percentage)); setName(''); setPercentage(''); } }} className="w-full bg-green-600 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2"><UserPlus size={16} /> إضافة شريك</button>
    </div>
  );
}
