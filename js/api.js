// 文件路径：js/api.js

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ⚠️ 请替换为您自己的 Supabase 配置 (保持您原有的配置不变)
const supabaseUrl = 'https://tuomplmnlkegbasklgft.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1b21wbG1ubGtlZ2Jhc2tsZ2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDY3NjIsImV4cCI6MjA5OTgyMjc2Mn0.ZDVB9iZ6XOVB_E73F4N75-9ig-reF9cV4T1H4zme8Fg'

let supabaseInstance = null;

try {
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase 配置缺失");
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
    console.log("✅ [API] Supabase 连接成功");
} catch (e) {
    console.error("❌ [API] Supabase 初始化失败:", e);
}

export const supabase = supabaseInstance;

// ================= 1. 身份认证 (Auth) =================

export async function login(email, password) {
    if (!supabase) throw new Error("系统未初始化");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
}

export async function checkSession() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// ================= 2. 文件上传 (Storage) - 修复版 =================

/**
 * 通用文件上传函数
 * @param {File} file - 文件对象
 * @param {string} bucketName - 存储桶名称 (如 'news-images', 'activity-files')
 */
export async function uploadFile(file, bucketName) {
    if (!supabase) throw new Error("数据库未连接");
    
    const fileExt = file.name.split('.').pop();
    // 生成防重名文件名
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    
    // 上传到指定 Bucket
    const { error } = await supabase.storage.from(bucketName).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
    });

    if (error) {
        console.error(`上传到 ${bucketName} 失败:`, error);
        throw error;
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return data.publicUrl;
}

// 兼容旧代码的图片上传 (默认到 news-images)
export async function uploadImage(file) {
    return await uploadFile(file, 'news-images');
}

// ================= 3. 通用 CRUD (数据库操作) =================

// [Create] 新增数据
export async function addItem(table, data) {
    if (!supabase) throw new Error("数据库未连接");
    const { error } = await supabase.from(table).insert([{ ...data, created_at: new Date() }]);
    if (error) throw error;
}

// [Delete] 删除数据
export async function deleteItem(table, id) {
    if (!supabase) throw new Error("数据库未连接");
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
}

// [Update] 修改数据
export async function updateItem(table, id, data) {
    if (!supabase) throw new Error("数据库未连接");
    
    // .select() 是为了获取返回数据，同时 .update() 会返回 status
    // 关键：Supabase v2 update 默认不返回 count，除非加 select 或 count 选项，但 update 操作本身在 response 里包含 count
    // 我们这里直接判断 error，如果没有 error 但 data 为空（受 RLS 限制），则手动抛出异常
    
    const { data: result, error } = await supabase
        .from(table)
        .update(data)
        .eq('id', id)
        .select(); // 加上 select() 以便确认数据确实被返回了

    if (error) throw error;

    // 核心修复逻辑：
    // 如果 result 是空数组，说明没有找到 ID 对应的行，或者 RLS 策略禁止了 Update
    if (!result || result.length === 0) {
        throw new Error("更新失败：未找到记录或权限不足 (请检查 Supabase RLS 的 UPDATE 策略)");
    }
}
// [Read - Single] 获取单条详情
export async function getItemById(table, id) {
    if (!supabase) return null;
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

// [Read - List] 获取列表 (支持搜索)
export async function getList(table, keyword = '', searchFields = ['title']) {
    if (!supabase) return [];

    let query = supabase.from(table).select('*').order('created_at', { ascending: false });

    // 构建模糊查询
    if (keyword && keyword.trim() !== '') {
        const orString = searchFields.map(field => `${field}.ilike.%${keyword}%`).join(',');
        query = query.or(orString);
    }

    const { data, error } = await query;
    if (error) {
        console.error(`获取 ${table} 列表失败:`, error.message);
        throw error;
    }
    return data;
}

// ================= 4. 专用获取函数 =================

// [新闻/公告] 获取文章列表
export async function getArticles(limit = 10, category = '') {
    if (!supabase) return [];
    
    let query = supabase.from('articles').select('*')
        .order('created_at', { ascending: false });
    
    if (category) {
        query = query.eq('category', category);
    }
    
    if (limit) {
        query = query.limit(limit);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// [新闻] 获取单篇文章
export async function getArticleById(id) {
    if (!supabase) return null;
    
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error) throw error;
    return data;
}

// [新闻] 增加浏览量
export async function incrementViews(id) {
    if (!supabase) return;
    supabase.rpc('increment_views', { article_id: id })
        .catch(err => console.warn('更新浏览量失败:', err));
}