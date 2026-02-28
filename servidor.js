<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Financeiro - DEV PDV</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root { --primary: #6366f1; --success: #10b981; --danger: #ef4444; --dark: #0f172a; --gray: #64748b; }
        body { font-family: 'Segoe UI', sans-serif; background: #f1f5f9; margin: 0; padding: 20px; }
        nav { background: var(--dark); color: white; padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-radius: 12px; margin-bottom: 20px; }
        .nav-btn { text-decoration: none; color: white; background: var(--primary); padding: 8px 15px; border-radius: 6px; font-weight: bold; }
        
        .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card-stat { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; }
        .card-stat h3 { margin: 0; color: var(--gray); font-size: 0.9rem; }
        .card-stat p { margin: 10px 0 0; font-size: 1.8rem; font-weight: bold; color: var(--dark); }
        .lucro { color: var(--success) !important; }

        .container-flex { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .painel { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { text-align: left; color: var(--gray); padding: 10px; border-bottom: 2px solid #f1f5f9; }
        td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }

        .btn-fechar { background: var(--success); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
        
        /* Cores das Formas de Pagamento */
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; color: white; text-transform: uppercase; }
        .bg-pix { background: #32bcad; }
        .bg-dinheiro { background: #10b981; }
        .bg-cartao { background: #6366f1; }
        .bg-padrao { background: var(--gray); }

        @media (max-width: 850px) {
            .container-flex { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>

<nav>
    <div style="display: flex; align-items: center; gap: 15px;">
        <h2>💰 Painel Financeiro</h2>
        <a href="/" class="nav-btn" style="background: var(--gray);">⬅ VOLTAR AO CAIXA</a>
    </div>
    <div id="user-info">👤 Carregando...</div>
</nav>

<div class="grid-stats">
    <div class="card-stat">
        <h3>VENDAS HOJE</h3>
        <p id="total-hoje">R$ 0,00</p>
    </div>
    <div class="card-stat">
        <h3>LUCRO HOJE</h3>
        <p id="lucro-hoje" class="lucro">R$ 0,00</p>
    </div>
    <div class="card-stat">
        <h3>FATURAMENTO GERAL</h3>
        <p id="total-geral">R$ 0,00</p>
    </div>
    <div class="card-stat">
        <h3>LUCRO GERAL</h3>
        <p id="lucro-geral" class="lucro">R$ 0,00</p>
    </div>
</div>

<div class="container-flex">
    <div class="painel">
        <h3>📊 PRODUTOS MAIS VENDIDOS (TOP 10)</h3>
        <div style="position: relative; height:300px; width:100%">
            <canvas id="graficoProdutos"></canvas>
        </div>
    </div>

    <div class="painel">
        <h3>📅 FECHAMENTO MENSAL</h3>
        <button class="btn-fechar" onclick="fecharMes()">GERAR FECHAMENTO DESTE MÊS</button>
        <table>
            <thead>
                <tr>
                    <th>Mês/Ano</th>
                    <th>Faturamento</th>
                    <th>Lucro</th>
                </tr>
            </thead>
            <tbody id="lista-fechamentos"></tbody>
        </table>
    </div>
</div>

<div class="painel" style="margin-top: 20px;">
    <h3>📜 ÚLTIMAS 50 VENDAS</h3>
    <div style="overflow-x: auto;">
        <table>
            <thead>
                <tr>
                    <th>Data/Hora</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Total</th>
                    <th>Pagamento</th>
                    <th>Vendedor</th>
                </tr>
            </thead>
            <tbody id="lista-vendas"></tbody>
        </table>
    </div>
</div>

<script>
    let meuGrafico = null;

    async function carregarDados() {
        try {
            const res = await fetch('/relatorio-vendas');
            const data = await res.json();

            document.getElementById('total-hoje').innerText = `R$ ${data.totalHoje.toFixed(2)}`;
            document.getElementById('lucro-hoje').innerText = `R$ ${data.lucroHoje.toFixed(2)}`;
            document.getElementById('total-geral').innerText = `R$ ${data.totalGeral.toFixed(2)}`;
            document.getElementById('lucro-geral').innerText = `R$ ${data.lucroGeral.toFixed(2)}`;

            // Tabela de Vendas com CORES e VENDEDOR
            document.getElementById('lista-vendas').innerHTML = data.historico.map(v => {
                let badgeClass = 'bg-padrao';
                if (v.forma_pagamento === 'Pix') badgeClass = 'bg-pix';
                if (v.forma_pagamento === 'Dinheiro') badgeClass = 'bg-dinheiro';
                if (v.forma_pagamento === 'Cartão') badgeClass = 'bg-cartao';

                return `
                    <tr>
                        <td>${new Date(v.data_venda).toLocaleString()}</td>
                        <td><strong>${v.nome_produto}</strong></td>
                        <td>${v.quantidade}</td>
                        <td>R$ ${v.valor_total.toFixed(2)}</td>
                        <td><span class="badge ${badgeClass}">${v.forma_pagamento}</span></td>
                        <td style="color: var(--primary); font-weight: bold;">👤 ${v.vendedor || '---'}</td>
                    </tr>
                `;
            }).join('');

            document.getElementById('lista-fechamentos').innerHTML = data.fechamentos.map(f => `
                <tr>
                    <td>${f.mes}</td>
                    <td>R$ ${f.total_faturamento.toFixed(2)}</td>
                    <td class="lucro">R$ ${f.total_lucro.toFixed(2)}</td>
                </tr>
            `).join('');

            carregarGrafico();
            
        } catch (e) {
            console.error("Erro ao carregar dados");
        }
    }

    async function carregarGrafico() {
        const res = await fetch('/ranking-produtos');
        const dados = await res.json();
        const nomes = dados.map(item => item._id);
        const quantidades = dados.map(item => item.totalVendido);
        const ctx = document.getElementById('graficoProdutos').getContext('2d');
        if (meuGrafico) { meuGrafico.destroy(); }
        meuGrafico = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: nomes,
                datasets: [{
                    label: 'Qtd Vendida',
                    data: quantidades,
                    backgroundColor: '#6366f1',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    async function fecharMes() {
        const hoje = new Date();
        const mesRef = `${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`;
        if (confirm(`Deseja fechar o relatório de ${mesRef}?`)) {
            await fetch('/fechar-mes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mes: mesRef })
            });
            carregarDados();
        }
    }

    async function carregarUser() {
        const res = await fetch('/dados-usuario');
        const user = await res.json();
        if (user.nome) document.getElementById('user-info').innerText = `👤 ${user.nome}`;
    }

    carregarUser();
    carregarDados();
</script>
</body>
</html>
