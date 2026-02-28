require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());

// ==========================================
// CONFIGURAÇÃO DE SESSÃO (SEGURANÇA)
// ==========================================
app.use(session({
    secret: 'chave-secreta-do-pdv',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

// ==========================================
// CONEXÃO MONGODB ATLAS
// ==========================================
const mongoURI = process.env.MONGODB_URI; 
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Conectado ao MongoDB Atlas!"))
    .catch(err => console.error("❌ Erro ao conectar:", err));

// ==========================================
// MODELOS (SCHEMAS)
// ==========================================
const Produto = mongoose.model('Produto', {
    nome: String,
    codigo_barras: { type: String, unique: true },
    preco: Number,
    preco_custo: Number,
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
// MIDDLEWARES
// ==========================================
const verificarLogin = (req, res, next) => {
    if (!req.session.usuarioLogado) return res.redirect('/login');
    next();
};

const restringirAdmin = (req, res, next) => {
    if (!req.session.usuarioLogado || req.session.usuarioLogado.cargo !== 'admin') {
        return res.status(403).json({erro: "Acesso negado"});
    }
    next();
};

// ==========================================
// ROTAS DE LOGIN E USUÁRIOS (O QUE FALTAVA)
// ==========================================
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.post('/login', async (req, res) => {
    const { user, pass } = req.body;
    const usuario = await Usuario.findOne({ login: user, senha: pass });
    if (usuario) {
        req.session.usuarioLogado = { nome: usuario.nome, cargo: usuario.cargo };
        res.json({ ok: true });
    } else {
        res.status(401).json({ erro: "Dados inválidos" });
    }
});

app.get('/logout', (req, res) => { 
    req.session.destroy();
    res.redirect('/login'); 
});

app.get('/dados-usuario', (req, res) => res.json(req.session.usuarioLogado || { erro: "Deslogado" }));

// BUSCAR LISTA DE USUÁRIOS (Para aparecer Walisson, Beatriz, etc)
app.get('/lista-usuarios', restringirAdmin, async (req, res) => {
    try {
        const usuarios = await Usuario.find({});
        res.json(usuarios);
    } catch (e) { res.status(500).json([]); }
});

// CADASTRAR NOVO USUÁRIO
app.post('/usuarios', restringirAdmin, async (req, res) => {
    try {
        await Usuario.create(req.body);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao criar" }); }
});

// DELETAR USUÁRIO (Botão ❌)
app.delete('/usuarios/:id', restringirAdmin, async (req, res) => {
    try {
        await Usuario.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao excluir" }); }
});

// ==========================================
// ROTAS DE PRODUTOS
// ==========================================
app.get('/', verificarLogin, (req, res) => res.sendFile(path.join(__dirname, 'caixa.html')));
app.get('/estoque', restringirAdmin, (req, res) => res.sendFile(path.join(__dirname, 'estoque.html')));
app.get('/financeiro', restringirAdmin, (req, res) => res.sendFile(path.join(__dirname, 'financeiro.html')));

app.get('/lista-estoque', verificarLogin, async (req, res) => {
    const busca = req.query.q || '';
    const produtos = await Produto.find({ nome: new RegExp(busca, 'i') });
    res.json(produtos);
});

app.post('/produto', restringirAdmin, async (req, res) => {
    const { nome, codigo_barras, preco, preco_custo, estoque } = req.body;
    await Produto.findOneAndUpdate({ codigo_barras }, { nome, preco, preco_custo, estoque }, { upsert: true });
    res.json({ ok: true });
});

app.delete('/produto/:id', restringirAdmin, async (req, res) => {
    await Produto.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

// ==========================================
// ROTAS DE VENDAS E FINANCEIRO
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
    } catch (e) { res.status(500).send("Erro"); }
});

app.get('/relatorio-vendas', restringirAdmin, async (req, res) => {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const todasVendas = await Venda.find().sort({ data_venda: -1 });
    const vendasHoje = todasVendas.filter(v => v.data_venda >= hoje);

    const totalHoje = vendasHoje.reduce((acc, v) => acc + v.valor_total, 0);
    const lucroHoje = totalHoje - vendasHoje.reduce((acc, v) => acc + v.valor_custo, 0);
    const totalGeral = todasVendas.reduce((acc, v) => acc + v.valor_total, 0);
    const lucroGeral = totalGeral - todasVendas.reduce((acc, v) => acc + v.valor_custo, 0);
    const fechamentos = await FechamentoMensal.find().sort({ data_geracao: -1 });

    res.json({ totalHoje, lucroHoje, totalGeral, lucroGeral, historico: todasVendas.slice(0, 50), fechamentos });
});

app.get('/ranking-produtos', restringirAdmin, async (req, res) => {
    const ranking = await Venda.aggregate([
        { $group: { _id: "$nome_produto", totalVendido: { $sum: "$quantidade" } } },
        { $sort: { totalVendido: -1 } },
        { $limit: 10 }
    ]);
    res.json(ranking);
});

app.post('/fechar-mes', restringirAdmin, async (req, res) => {
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
