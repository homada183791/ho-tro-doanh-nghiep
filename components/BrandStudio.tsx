
import React, { useState, useEffect } from 'react';
import { generateBrandAsset } from '../services/gemini';
import { ImageSettings, ImageSize } from '../types';
import { Image as ImageIcon, Loader2, Download, Wand2, Settings2, Key } from 'lucide-react';

const BrandStudio: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<ImageSize>('1K');
  const [aspectRatio, setAspectRatio] = useState<ImageSettings['aspectRatio']>('1:1');
  const [loading, setLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Fix: Mandatory API key selection state for Gemini 3 Pro Image
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Fix: Check if API key has been selected on mount
  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  // Fix: Handler to open API key selection dialog
  const handleOpenKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      // Fix: Assume selection success after dialog closes per guidelines
      setHasKey(true);
    }
  };

  const handleGenerate = async () => {
    if (!prompt) return;

    setLoading(true);
    setError(null);
    setGeneratedImages([]);

    try {
      const images = await generateBrandAsset({
        prompt: `Professional minimalist logo design for business: ${prompt}, vector style, clean, high quality`,
        size,
        aspectRatio
      });
      setGeneratedImages(images);
      if (images.length === 0) {
          setError("Không tạo được hình ảnh nào. Vui lòng thử lại.");
      }
    } catch (err: any) {
      console.error(err);
      // Fix: Reset key selection if entity not found error occurs
      if (err.message && err.message.includes("Requested entity was not found")) {
         setError("Lỗi xác thực API Key. Vui lòng thử lại và chọn Key hợp lệ từ dự án có bật thanh toán.");
         setHasKey(false);
      } else {
         setError(`Có lỗi khi tạo hình ảnh: ${err?.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800">Thiết Kế Thương Hiệu</h2>
        <p className="text-slate-500 mt-2">Tạo logo và bộ nhận diện thương hiệu với Gemini 3 Pro Image.</p>
      </header>

      {/* Fix: Display API key selection prompt if not selected */}
      {hasKey === false && (
        <div className="mb-8 p-6 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
               <Key className="w-6 h-6" />
            </div>
            <div className="text-amber-800">
              <h4 className="font-bold text-lg mb-1">Yêu cầu cấu hình API Key</h4>
              <p className="text-sm opacity-90 mb-2">Để sử dụng Gemini 3 Pro Image, bạn cần chọn một API Key từ dự án Google Cloud có bật thanh toán.</p>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noreferrer" 
                className="text-sm font-semibold underline hover:text-amber-900"
              >
                Tìm hiểu về tài khoản trả phí (Billing)
              </a>
            </div>
          </div>
          <button 
            onClick={handleOpenKey} 
            className="whitespace-nowrap px-6 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition shadow-md"
          >
            Chọn API Key
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800">
              <Settings2 className="w-5 h-5 text-blue-600" />
              Cấu hình
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả ý tưởng (Prompt)</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                  placeholder="VD: Một logo hình con rồng cách điệu, màu xanh dương, hiện đại..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kích thước ảnh (Size)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['1K', '2K', '4K'] as ImageSize[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition ${
                        size === s
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tỷ lệ khung hình</label>
                <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                >
                    <option value="1:1">1:1 (Vuông)</option>
                    <option value="4:3">4:3 (Ngang)</option>
                    <option value="16:9">16:9 (Rộng)</option>
                    <option value="3:4">3:4 (Dọc)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100">
                <button
                    onClick={handleGenerate}
                    disabled={loading || !prompt || hasKey === false}
                    className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg flex items-center justify-center gap-2 transition-all ${
                    loading || !prompt || hasKey === false
                        ? 'bg-slate-300 cursor-not-allowed shadow-none text-slate-500'
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:shadow-purple-500/25 active:scale-[0.98]'
                    }`}
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                    {loading ? 'Đang vẽ...' : 'Tạo Thiết Kế'}
                </button>
                 <p className="text-[10px] text-slate-400 mt-3 text-center">
                    * Gemini 3 Pro Image yêu cầu API Key trả phí để hỗ trợ độ phân giải cao và chất lượng thiết kế tối ưu.
                </p>
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px] p-8 flex flex-col items-center justify-center relative">
                 {error && (
                    <div className="absolute top-4 left-4 right-4 bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-200 shadow-sm">
                        {error}
                    </div>
                )}
                
                {loading ? (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative w-24 h-24">
                            <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <p className="text-slate-500 font-medium animate-pulse">AI đang phác thảo ý tưởng...</p>
                    </div>
                ) : generatedImages.length > 0 ? (
                    <div className="w-full h-full flex flex-col items-center gap-6">
                        {generatedImages.map((img, idx) => (
                            <div key={idx} className="relative group rounded-xl overflow-hidden shadow-2xl border border-slate-200">
                                <img src={img} alt="Generated Brand Asset" className="max-w-full max-h-[600px] object-contain" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4">
                                     <a 
                                        href={img} 
                                        download={`brand-asset-${Date.now()}.png`}
                                        className="p-3 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition shadow-lg"
                                        title="Tải xuống"
                                     >
                                         <Download className="w-6 h-6" />
                                     </a>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-slate-300">
                        <ImageIcon className="w-24 h-24 mx-auto mb-4 opacity-20" />
                        <p className="text-lg font-medium">Nhập mô tả và nhấn nút Tạo để bắt đầu</p>
                        {hasKey === false && <p className="text-sm mt-2 text-slate-400">Vui lòng chọn API Key trước khi thực hiện thiết kế.</p>}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default BrandStudio;
