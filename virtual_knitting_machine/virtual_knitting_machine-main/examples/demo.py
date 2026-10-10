"""
Demo: tricota um rib 1x1 na máquina virtual e salva o estado da máquina como SVG.

Uso (a partir da pasta do projeto):
    .\\.venv\\Scripts\\python examples\\demo.py [saida.svg]
"""

import sys
from pathlib import Path

from virtual_knitting_machine.Knitting_Machine import Knitting_Machine
from virtual_knitting_machine.machine_components.carriage_system.Carriage_Pass_Direction import Carriage_Pass_Direction as D
from virtual_knitting_machine.machine_components.yarn_management.Yarn_Carrier_Set import Yarn_Carrier_Set
from virtual_knitting_machine.visualizer.knitting_machine_state_visualizer import Knitting_Machine_State_Visualizer

m = Knitting_Machine()
cs = Yarn_Carrier_Set(1)

# Montagem (cast-on) com tucks alternados em 10 agulhas da frente
m.in_hook(1)
for i in range(9, -1, -2):
    m.tuck(cs, m.get_specified_needle(True, i), D.Leftward)
for i in range(0, 10, 2):
    m.tuck(cs, m.get_specified_needle(True, i), D.Rightward)
m.release_hook()
print("Cast-on: laçadas na frente =", len(m.front_loops()))

# Transfere as agulhas ímpares para trás -> rib 1x1
for n in m.front_loops()[1::2]:
    m.xfer(n)
print("Após xfer (rib 1x1): frente =", len(m.front_loops()), "| trás =", len(m.back_loops()))

# 8 passadas de tricô
for _ in range(4):
    for n in D.Leftward.sort_needles(m.all_loops()):
        m.knit(cs, n, D.Leftward)
    for n in D.Rightward.sort_needles(m.all_loops()):
        m.knit(cs, n, D.Rightward)
print("Após 8 passadas: laçadas nas agulhas =", len(m.all_loops()))
print("Agulhas ativas:", [str(n) for n in m.all_loops()])

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("rib_1x1.svg")
Knitting_Machine_State_Visualizer(m).save(str(out))
print("SVG salvo em", out.resolve())
