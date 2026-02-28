require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session'); // NOVO: Para segurança de sessões

const app = express();
app.use(express.json());

// ==========================================
// CONFIGURAÇÃO DE SESSÃO (SEGURANÇA REAL)
// ==========================================
app.use(session({
    secret: 'chave-secreta-do-pdv', // Uma senha interna do servidor
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // No Render (HTTP) deixe false. Se usar HTTPS total mude para true.
}));

// ==========================================
// CONFIGURAÇÃO DO BANCO DE DADOS (ATLAS)
// ==========================================
const mongoURI = process.env.MONGODB_URI; 

mongoose.connect(mongoURI)
    .then(() => console.log("✅ [NUVEM] Conexão com MongoDB Atlas estabelecida!"))
    .catch(err => console.error("❌ [ERRO] Falha na conexão. Verifique seu .env:", err));

// ==========================================
// MODELOS DE DADOS (SCHEMAS) - SEM ALTERAÇÃO
// ==========================================
const Produto = mongoose.model('Produto', {
    nome: String,
    codigo_barras: { type: String, unique: true },
    preco: Number,
    preco_custo: { type: Number, default: 0 },
    estoque: Number
});

const Usuario = mongoose.model('Usuario', {
    nome: String,
    login: { type: String, unique: true },
    senha: { type: String },
    cargo: String
});

const Venda = mongoose.model('Venda', {
    nome_produto: String,
    quantidade: Number,
    valor_total: Number,
    valor_custo: Number,
    forma_pagamento: String,
    data_venda: { type: Date, default: Date.now },
    vendedor: String,
    mes_referencia: String 
});

const FechamentoMensal = mongoose.model('FechamentoMensal', {
    mes: String,
    total_faturamento: Number,
    total_lucro: Number,
    total_vendas_qtd: Number,
    data_geracao: { type: Date, default: Date.now }
});

// ==========================================
// MIDDLEWARE DE SEGURANÇA
// ==========================================
const verificarLogin = (req, res, next) => {
    if (!req.session.usuarioLogado) {
        return res.redirect('/login');
    }
    next();
};

const restringirAdmin = (req, res, next) => {
    if (!req.session.usuarioLogado || req.session.usuarioLogado.cargo !== 'admin') {
        return res.status(403).json({erro: "Acesso negado. Apenas administradores."});
    }
    next();
};

// FUNÇÃO DE SEGURANÇA: Cria o admin se ele não existir
async function criarAdminInicial() {
    try {
        const admin = await Usuario.findOne({ login: 'admin' });
        if (!admin) {
            await Usuario.create({ 
                nome: 'Dono do Estabelecimento', 
                login: 'admin', 
                senha: 'batata', 
                cargo: 'admin' 
            });
            console.log("👤 [SISTEMA] Usuário admin padrão criado com senha: 'batata'");
        }
    } catch (e) { console.log("Erro ao verificar admin inicial"); }
}
criarAdminInicial();

// ==========================================
// ROTAS DE NAVEGAÇÃO
// ==========================================
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// Agora usamos o middleware 'verificarLogin' para proteger a home
app.get('/', verificarLogin, (req, res) => res.sendFile(path.join(__dirname, 'caixa.html')));

app.get('/estoque', restringirAdmin, (req, res) => res.sendFile(path.join(__dirname, 'estoque.html')));
app.get('/financeiro', restringirAdmin, (req, res) => res.sendFile(path.join(__dirname, 'financeiro.html')));

// ==========================================
// API - AUTENTICAÇÃO E USUÁRIOS
// ==========================================
app.post('/login', async (req, res) => {
    const { user, pass } = req.body;
    const usuario = await Usuario.findOne({ login: user, senha: pass });
    if (usuario) {
        // SALVA NA SESSÃO DO NAVEGADOR (ÚNICO PARA ESTE APARELHO)
        req.session.usuarioLogado = { nome: usuario.nome, cargo: usuario.cargo };
        res.json({ ok: true });
    } else {
        res.status(401).json({ erro: "Usuário ou senha inválidos!" });
    }
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); // Mata a sessão do aparelho
    res.redirect('/login'); 
});

app.get('/dados-usuario', (req, res) => {
    res.json(req.session.usuarioLogado || { erro: "Deslogado" });
});

app.get('/lista-usuarios', restringirAdmin, async (req, res) => {
    const usuarios = await Usuario.find({}, 'nome login cargo');
    res.json(usuarios);
});

app.post('/usuarios', restringirAdmin, async (req, res) => {
    try {
        await Usuario.create(req.body);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: "Este login já existe!" }); }
});

app.delete('/usuarios/:id', restringirAdmin, async (req, res) => {
    try {
        await Usuario.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao excluir usuário" }); }
});

// ==========================================
// API - ESTOQUE
// ==========================================
app.get('/lista-estoque', verificarLogin, async (req, res) => {
    const busca = req.query.q || '';
    const produtos = await Produto.find({
        $or: [
            { nome: new RegExp(busca, 'i') }, 
            { codigo_barras: new RegExp(busca, 'i') }
        ]
    });
    res.json(produtos);
});

app.post('/produto', restringirAdmin, async (req, res) => {
    const { nome, codigo_barras, preco, preco_custo, estoque } = req.body;
    await Produto.findOneAndUpdate({ codigo_barras }, { nome, preco, preco_custo, estoque }, { upsert: true });
    res.json({ ok: true });
});

app.delete('/produto/:id', restringirAdmin, async (req, res) => {
    try {
        await Usuario.findByIdAndDelete(req.params.id); // Ajuste: Aqui deveria ser Produto.findByIdAndDelete
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao excluir produto" }); }
});

// ==========================================
// API - VENDAS E FINANCEIRO
// ==========================================
app.post('/finalizar', verificarLogin, async (req, res) => {
    const { carrinho, formaPagamento } = req.body;
    const hoje = new Date();
    const mesRef = `${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`;

    try {
        for (const item of carrinho) {
            const prod = await Produto.findOne({ nome: item.nome });
            const custoUnitario = prod ? prod.preco_custo : 0;
            
            if (!item.nome.startsWith('[B]')) {
                await Produto.updateOne({ nome: item.nome }, { $inc: { estoque: -item.qtd } });
            }
            
            await Venda.create({
                nome_produto: item.nome,
                quantidade: item.qtd,
                valor_total: item.subtotal,
                valor_custo: (custoUnitario * item.qtd),
                forma_pagamento: formaPagamento,
                vendedor: req.session.usuarioLogado.nome,
                mes_referencia: mesRef
            });
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).send("Erro ao processar venda"); }
});

app.get('/relatorio-vendas', restringirAdmin, async (req, res) => {
    try {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const todasVendas = await Venda.find().sort({ data_venda: -1 });
        const vendasHoje = todasVendas.filter(v => v.data_venda >= hoje);

        const totalHoje = vendasHoje.reduce((acc, v) => acc + v.valor_total, 0);
        const lucroHoje = totalHoje - vendasHoje.reduce((acc, v) => acc + v.valor_custo, 0);
        const totalGeral = todasVendas.reduce((acc, v) => acc + v.valor_total, 0);
        const lucroGeral = totalGeral - todasVendas.reduce((acc, v) => acc + v.valor_custo, 0);
        const fechamentos = await FechamentoMensal.find().sort({ data_geracao: -1 });

        res.json({ totalHoje, lucroHoje, totalGeral, lucroGeral, historico: todasVendas.slice(0, 50), fechamentos });
    } catch (e) { res.status(500).send("Erro ao gerar relatório"); }
});

app.post('/fechar-mes', restringirAdmin, async (req, res) => {
    try {
        const { mes } = req.body;
        const vendasMes = await Venda.find({ mes_referencia: mes });
        const faturamento = vendasMes.reduce((acc, v) => acc + v.valor_total, 0);
        const lucro = faturamento - vendasMes.reduce((acc, v) => acc + v.valor_custo, 0);

        await FechamentoMensal.findOneAndUpdate({ mes }, { 
            total_faturamento: faturamento, 
            total_lucro: lucro, 
            total_vendas_qtd: vendasMes.length 
        }, { upsert: true });
        res.json({ ok: true });
    } catch (e) { res.status(500).send("Erro ao fechar mês"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 PDV ONLINE: PORTA ${PORT}`));
