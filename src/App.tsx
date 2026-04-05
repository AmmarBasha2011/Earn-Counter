/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Upload, 
  FileText, 
  Save, 
  History, 
  Settings, 
  ChevronLeft, 
  Camera, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  Edit2,
  DollarSign,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI, Type } from '@google/genai';
import { cn } from './lib/utils';
import { Product, InvoiceItem, SavedInvoice } from './types';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [view, setView] = useState<'home' | 'products' | 'analyze' | 'history'>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<InvoiceItem[] | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load data from LocalStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('products');
    const savedInvoices = localStorage.getItem('invoices');
    if (savedProducts) setProducts(JSON.parse(savedProducts));
    if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
    
    // Set RTL on body
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }, []);

  // Save data to LocalStorage
  useEffect(() => {
    localStorage.setItem('products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('invoices', JSON.stringify(invoices));
  }, [invoices]);

  const addProduct = (name: string, price: number) => {
    const newProduct: Product = {
      id: crypto.randomUUID(),
      name,
      purchasePrice: price
    };
    setProducts([...products, newProduct]);
  };

  const deleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
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
      ملاحظة هامة: إذا وجدت بنوداً مثل "الكلارك" أو "كلارك" أو "نقل" أو "توصيل"، استخرجها أيضاً.
      أريد النتيجة بتنسيق JSON فقط كمصفوفة من الكائنات:
      [{"name": "اسم المنتج", "sellingPrice": 10.5, "quantity": 1}]
      تأكد من أن الأسماء باللغة العربية كما هي في الفاتورة.`;

      const result = await genAI.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image.split(',')[1]
                }
              }
            ]
          }
        ],
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
      
      // Match with existing products to get purchase price
      const itemsWithPurchasePrice = extractedItems.map((item: any) => {
        const isSpecialItem = item.name.includes('الكلارك') || item.name.includes('كلارك') || item.name.includes('نقل') || item.name.includes('توصيل');
        
        const matchedProduct = products.find(p => 
          p.name.toLowerCase().includes(item.name.toLowerCase()) || 
          item.name.toLowerCase().includes(p.name.toLowerCase())
        );

        let purchasePrice = matchedProduct ? matchedProduct.purchasePrice : 0;
        
        // If it's a special item (Clark/Transfer), set purchase price same as selling price to have 0 profit
        if (isSpecialItem) {
          purchasePrice = item.sellingPrice;
        }

        return {
          id: crypto.randomUUID(),
          name: item.name,
          sellingPrice: item.sellingPrice,
          purchasePrice: purchasePrice,
          quantity: item.quantity || 1
        };
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
    
    const totalProfit = analysisResult.reduce((sum, item) => 
      sum + ((item.sellingPrice - item.purchasePrice) * item.quantity), 0
    );

    const newInvoice: SavedInvoice = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleString('ar-EG'),
      items: analysisResult,
      totalProfit,
      image: tempImage || undefined
    };

    setInvoices([newInvoice, ...invoices]);
    setAnalysisResult(null);
    setTempImage(null);
    setView('history');
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    if (!analysisResult) return;
    setAnalysisResult(analysisResult.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (id: string) => {
    if (!analysisResult) return;
    setAnalysisResult(analysisResult.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans rtl">
      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-lg border-t border-slate-800 px-6 py-3 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <NavButton active={view === 'home'} onClick={() => setView('home')} icon={<FileText size={24} />} label="الرئيسية" />
          <NavButton active={view === 'products'} onClick={() => setView('products')} icon={<Package size={24} />} label="المنتجات" />
          <NavButton active={view === 'history'} onClick={() => setView('history')} icon={<History size={24} />} label="السجل" />
        </div>
      </nav>

      <main className="pb-24 pt-6 px-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <header className="text-center py-8">
                <h1 className="text-3xl font-bold text-blue-500 mb-2">محاسب الفواتير</h1>
                <p className="text-slate-400">حلل فواتيرك واحسب أرباحك بلمسة واحدة</p>
              </header>

              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center transition-all cursor-pointer",
                  isDragActive ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                )}
              >
                <input {...getInputProps()} />
                <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-4 text-blue-500">
                  {isAnalyzing ? <Loader2 className="animate-spin" size={40} /> : <Camera size={40} />}
                </div>
                <p className="text-lg font-semibold mb-1">
                  {isAnalyzing ? "جاري التحليل..." : "ارفع صورة الفاتورة"}
                </p>
                <p className="text-slate-500 text-sm">أو اسحب الصورة وأفلتها هنا</p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-4 flex items-center gap-3 text-red-400">
                  <AlertCircle size={20} />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <QuickStat label="إجمالي الأرباح" value={`${invoices.reduce((s, i) => s + i.totalProfit, 0).toFixed(2)}`} icon={<DollarSign className="text-green-500" />} />
                <QuickStat label="عدد الفواتير" value={`${invoices.length}`} icon={<FileText className="text-blue-500" />} />
              </div>
            </motion.div>
          )}

          {view === 'products' && (
            <motion.div 
              key="products"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">قائمة المنتجات</h2>
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-800 rounded-full">
                  <ChevronLeft size={24} />
                </button>
              </div>

              <AddProductForm onAdd={addProduct} />

              <div className="space-y-3">
                {products.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Package size={48} className="mx-auto mb-4 opacity-20" />
                    <p>لا توجد منتجات مضافة بعد</p>
                  </div>
                ) : (
                  products.map(product => (
                    <div key={product.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold">{product.name}</h3>
                        <p className="text-sm text-slate-400">سعر الشراء: {product.purchasePrice} ج.م</p>
                      </div>
                      <button 
                        onClick={() => deleteProduct(product.id)}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'analyze' && analysisResult && (
            <motion.div 
              key="analyze"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">نتائج التحليل</h2>
                <button onClick={() => { setAnalysisResult(null); setView('home'); }} className="p-2 hover:bg-slate-800 rounded-full">
                  <ChevronLeft size={24} />
                </button>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-center gap-3 text-blue-400">
                <AlertCircle size={20} />
                <p className="text-xs">يمكنك تعديل الأسماء والأسعار إذا وجد خطأ في التحليل</p>
              </div>

              <div className="space-y-4">
                {analysisResult.map(item => (
                  <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <Edit2 size={16} className="text-slate-500" />
                      <input 
                        className="bg-transparent border-none focus:ring-0 p-0 font-bold text-lg w-full"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">سعر البيع</label>
                        <div className="flex items-center bg-slate-800 rounded-xl px-3 py-2">
                          <input 
                            type="number"
                            className="bg-transparent border-none focus:ring-0 p-0 w-full text-sm"
                            value={item.sellingPrice}
                            onChange={(e) => updateItem(item.id, 'sellingPrice', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">سعر الشراء</label>
                        <div className="flex items-center bg-slate-800 rounded-xl px-3 py-2">
                          <input 
                            type="number"
                            className="bg-transparent border-none focus:ring-0 p-0 w-full text-sm"
                            value={item.purchasePrice}
                            onChange={(e) => updateItem(item.id, 'purchasePrice', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 p-1 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="text-sm">
                        الكمية: <span className="font-bold">{item.quantity}</span>
                      </div>
                      <div className={cn(
                        "font-bold",
                        (item.sellingPrice - item.purchasePrice) >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        الربح: {((item.sellingPrice - item.purchasePrice) * item.quantity).toFixed(2)} ج.م
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="sticky bottom-24 bg-slate-900/90 backdrop-blur p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">إجمالي ربح الفاتورة</span>
                  <span className="text-2xl font-bold text-green-500">
                    {analysisResult.reduce((sum, item) => sum + ((item.sellingPrice - item.purchasePrice) * item.quantity), 0).toFixed(2)} ج.م
                  </span>
                </div>
                <button 
                  onClick={saveInvoice}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
                >
                  <Save size={20} />
                  حفظ الفاتورة
                </button>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">سجل الفواتير</h2>
                <button onClick={() => setView('home')} className="p-2 hover:bg-slate-800 rounded-full">
                  <ChevronLeft size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <History size={48} className="mx-auto mb-4 opacity-20" />
                    <p>لا يوجد سجل فواتير بعد</p>
                  </div>
                ) : (
                  invoices.map(invoice => (
                    <div key={invoice.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                      <div className="p-4 flex justify-between items-start">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">{invoice.date}</p>
                          <h3 className="font-bold">فاتورة #{invoice.id.slice(0, 8)}</h3>
                          <p className="text-sm text-slate-400">{invoice.items.length} منتجات</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-slate-500 mb-1">إجمالي الربح</p>
                          <p className="text-xl font-bold text-green-500">{invoice.totalProfit.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="bg-slate-800/50 px-4 py-2 flex justify-between items-center">
                        <button 
                          onClick={() => {
                            setInvoices(invoices.filter(i => i.id !== invoice.id));
                          }}
                          className="text-xs text-red-400 flex items-center gap-1 hover:text-red-300"
                        >
                          <Trash2 size={14} /> حذف
                        </button>
                        <button 
                          onClick={() => {
                            setAnalysisResult(invoice.items);
                            setTempImage(invoice.image || null);
                            setView('analyze');
                          }}
                          className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300"
                        >
                          <Edit2 size={14} /> عرض وتعديل
                        </button>
                      </div>
                    </div>
                  ))
                )}
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
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-blue-500 scale-110" : "text-slate-500 hover:text-slate-300"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

function QuickStat({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function AddProductForm({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;
    onAdd(name, parseFloat(price));
    setName('');
    setPrice('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 p-4 rounded-3xl space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold">اسم المنتج</label>
        <input 
          className="w-full bg-slate-800 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all"
          placeholder="مثال: حليب المراعي"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold">سعر الشراء</label>
        <input 
          type="number"
          step="0.01"
          className="w-full bg-slate-800 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all"
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <button 
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all"
      >
        <Plus size={20} />
        إضافة منتج
      </button>
    </form>
  );
}
